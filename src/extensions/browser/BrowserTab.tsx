import React, { useRef, useState, useEffect, useCallback } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, X, Globe } from 'lucide-react'
import { useTabsStore } from '@/store/tabs'
import { useConfigStore } from '@/store/config'
import { useSidebarStore } from '@/store/sidebar'
import { useLayoutStore } from '@/store/layout'
import { useWorkSessionsStore } from '@/store/work-sessions'
import { useProjectStore } from '@/store/project'
import type { TabProps } from '@/extensions/types'
import {
  isAtlassianUrl,
  buildAtlassianInjectScript,
  CONDUCTOR_MSG_PREFIX,
  type ConductorMessage,
} from './atlassian-inject'

// Injected CSS to add claude code bridge
const INJECT_CSS = `
/* Conductor browser injection */
`

// Injected JS to expose bridge
const INJECT_JS = `
(function() {
  if (window.__claudeCode) return;

  const listeners = [];

  window.__claudeCode = {
    sendMessage: function(data) {
      window.dispatchEvent(new CustomEvent('__claudeCode:send', { detail: data }));
    },
    onMessage: function(callback) {
      listeners.push(callback);
      window.addEventListener('__claudeCode:receive', function(e) {
        callback(e.detail);
      });
    }
  };

  console.log('[Conductor] Bridge injected');
})();
`

// Extended webview element type for Electron
type WebviewElement = HTMLElement & {
  src?: string
  canGoBack: () => boolean
  canGoForward: () => boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  stop: () => void
  getURL: () => string
  getTitle: () => string
  loadURL: (url: string) => Promise<void>
  insertCSS: (css: string) => Promise<void>
  executeJavaScript: (js: string) => Promise<unknown>
}

// Custom data type set during tab drags — must match the key in TabGroup.tsx
const DRAGGING_TAB_KEY = '__dragging_tab__'

export default function BrowserTab({ tabId, groupId, isActive, tab }: TabProps): React.ReactElement {
  const initialUrl = tab.url
  // inputUrl drives the address bar display; it updates on navigation events
  // without feeding back into the webview's src attribute.
  const [inputUrl, setInputUrl] = useState(initialUrl || '')
  const [isLoading, setIsLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const webviewRef = useRef<WebviewElement | null>(null)
  // initialSrc is set once and never changes — prevents React re-renders
  // from resetting the webview's src and causing full-page reloads.
  const [initialSrc] = useState(initialUrl || 'about:blank')
  const { updateTab, addTab } = useTabsStore()

  // Stores needed for Conductor actions on Atlassian pages
  const getConfig = useConfigStore.getState
  const getRootPath = () => useSidebarStore.getState().rootPath
  const getFocusedGroupId = () => useLayoutStore.getState().focusedGroupId

  // Track whether a tab drag or pane resize is in progress so we can show a
  // transparent overlay on top of the webview. Electron's <webview> is a native
  // element that swallows all mouse/drag events, preventing TabGroup's NESW
  // drop zone logic and SplitPane/Sidebar resize handlers from receiving them.
  const [isTabDragging, setIsTabDragging] = useState(false)
  const [isPaneResizing, setIsPaneResizing] = useState(false)

  // Safety timeout: if a drag/resize end event is lost (e.g. window loses
  // focus, Electron edge case), auto-reset after 3 seconds so the overlay
  // doesn't permanently block clicks on the webview.
  const OVERLAY_SAFETY_TIMEOUT_MS = 3000

  useEffect(() => {
    if (!isTabDragging && !isPaneResizing) return
    const timer = setTimeout(() => {
      setIsTabDragging(false)
      setIsPaneResizing(false)
    }, OVERLAY_SAFETY_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [isTabDragging, isPaneResizing])

  useEffect(() => {
    const handleDragStart = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes(DRAGGING_TAB_KEY)) {
        setIsTabDragging(true)
      }
    }
    const handleDragEnd = () => setIsTabDragging(false)
    const handleDrop = () => setIsTabDragging(false)

    const handleResizeStart = () => setIsPaneResizing(true)
    const handleResizeEnd = () => setIsPaneResizing(false)

    // Additional safety: reset drag state if window loses focus, since
    // drag/resize operations can't continue without the window.
    const handleWindowBlur = () => {
      setIsTabDragging(false)
      setIsPaneResizing(false)
    }

    window.addEventListener('dragstart', handleDragStart)
    window.addEventListener('dragend', handleDragEnd)
    window.addEventListener('drop', handleDrop)
    window.addEventListener('pane-resize-start', handleResizeStart)
    window.addEventListener('pane-resize-end', handleResizeEnd)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('dragstart', handleDragStart)
      window.removeEventListener('dragend', handleDragEnd)
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('pane-resize-start', handleResizeStart)
      window.removeEventListener('pane-resize-end', handleResizeEnd)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [])

  // Sync nav state (back/forward buttons, URL bar, tab title) from the webview
  // without touching the src attribute.
  const syncNavState = useCallback(() => {
    const wv = webviewRef.current
    if (!wv) return
    setCanGoBack(wv.canGoBack())
    setCanGoForward(wv.canGoForward())
    setInputUrl(wv.getURL())
    const title = wv.getTitle()
    if (title) {
      updateTab(groupId, tabId, { title: title.slice(0, 40) })
    }
  }, [groupId, tabId, updateTab])

  /**
   * Resolves (or creates) a git worktree for the given ticket key,
   * mirroring the logic in the Jira board extension.
   */
  const resolveWorktree = useCallback(async (ticketKey: string): Promise<{ cwd: string }> => {
    const sessionsStore = useWorkSessionsStore.getState()
    const session = sessionsStore.getActiveSessionForTicket(ticketKey)
    if (session?.worktree?.path) return { cwd: session.worktree.path }

    const repoPath = getRootPath()
    if (!repoPath) throw new Error('No project root path available to create worktree')

    const worktrees = await window.electronAPI.worktreeList(repoPath)
    const branchLower = ticketKey.toLowerCase()
    const existing = worktrees.find(wt => wt.branch.toLowerCase().includes(branchLower))

    const tmuxName = `t-${ticketKey}`
    if (existing) {
      const worktree = { path: existing.path, branch: existing.branch, baseBranch: 'main' }
      if (session) {
        await sessionsStore.updateSession(session.id, { worktree })
      } else {
        await sessionsStore.createSession({
          projectPath: useProjectStore.getState().filePath || '',
          ticketKey,
          jiraConnectionId: '',
          worktree,
          tmuxSessionId: tmuxName,
          claudeSessionId: null,
          prUrl: null,
          status: 'active',
        })
      }
      return { cwd: existing.path }
    }

    const result = await window.electronAPI.worktreeAdd(repoPath, branchLower)
    if (result.success && result.path) {
      const worktree = { path: result.path, branch: branchLower, baseBranch: 'main' }
      if (session) {
        await sessionsStore.updateSession(session.id, { worktree })
      } else {
        await sessionsStore.createSession({
          projectPath: useProjectStore.getState().filePath || '',
          ticketKey,
          jiraConnectionId: '',
          worktree,
          tmuxSessionId: tmuxName,
          claudeSessionId: null,
          prUrl: null,
          status: 'active',
        })
      }
      return { cwd: result.path }
    }

    throw new Error(`Failed to create worktree for ${ticketKey}: ${result.error || 'unknown error'}`)
  }, [])

  /** Build the Claude prompt from the configured template */
  const buildPrompt = useCallback((ticketKey: string, domain: string) => {
    const config = getConfig()
    const template = config.config.aiCli.claudeCode.startWorkPromptTemplate
    const projectKey = ticketKey.replace(/-\d+$/, '')
    return template
      .replace(/\{\{ticketKey\}\}/g, ticketKey)
      .replace(/\{\{projectKey\}\}/g, projectKey)
      .replace(/\{\{domain\}\}/g, domain)
  }, [getConfig])

  /**
   * Handles messages from the injected Atlassian script.
   * Dispatches to the appropriate action based on the message type.
   */
  const handleConductorAction = useCallback(async (msg: ConductorMessage) => {
    const { action, ticketKey } = msg
    const targetGroup = getFocusedGroupId() || groupId
    const tmuxName = `t-${ticketKey}`

    // Extract the Atlassian domain from the current webview URL
    const currentUrl = webviewRef.current?.getURL() || ''
    let domain = 'atlassian.net'
    try {
      domain = new URL(currentUrl).hostname
    } catch { /* use fallback */ }

    try {
      switch (action) {
        case 'start-coding-in-tab': {
          // Kill stale sessions before starting fresh
          try { await window.electronAPI.conductordKillTmuxSession(tmuxName) } catch { /* ok */ }
          await window.electronAPI.killTerminal(tmuxName)

          const { cwd } = await resolveWorktree(ticketKey)
          const prompt = buildPrompt(ticketKey, domain)
          const escaped = prompt.replace(/'/g, "'\\''")
          const skipPerms = getConfig().config.aiCli.claudeCode.skipDangerousPermissions
          const flag = skipPerms ? ' --dangerously-skip-permissions' : ''
          const initialCommand = `cd ${JSON.stringify(cwd)} && claude${flag} '${escaped}'\n`

          addTab(targetGroup, {
            id: tmuxName,
            type: 'claude-code',
            title: `Claude · ${ticketKey}`,
            filePath: cwd,
            initialCommand,
            autoPilot: true,
          })
          break
        }

        case 'start-coding-in-background': {
          try { await window.electronAPI.conductordKillTmuxSession(tmuxName) } catch { /* ok */ }
          await window.electronAPI.killTerminal(tmuxName)

          const { cwd } = await resolveWorktree(ticketKey)
          const prompt = buildPrompt(ticketKey, domain)
          const escaped = prompt.replace(/'/g, "'\\''")
          const skipPerms = getConfig().config.aiCli.claudeCode.skipDangerousPermissions
          const flag = skipPerms ? ' --dangerously-skip-permissions' : ''
          const command = `cd ${JSON.stringify(cwd)} && claude${flag} '${escaped}'\n`

          await window.electronAPI.createTerminal(tmuxName, cwd, command)
          await window.electronAPI.setAutoPilot(tmuxName, true)
          break
        }

        case 'open-in-claude': {
          const { cwd } = await resolveWorktree(ticketKey)
          addTab(targetGroup, {
            id: tmuxName,
            type: 'claude-code',
            title: `Claude · ${ticketKey}`,
            filePath: cwd,
            initialCommand: `cd ${JSON.stringify(cwd)} && claude\n`,
          })
          break
        }

        case 'open-in-vscode': {
          const { cwd } = await resolveWorktree(ticketKey)
          await window.electronAPI.openExternal(`vscode://file/${cwd}`)
          break
        }
      }
    } catch (err) {
      console.error(`[Conductor] Action "${action}" failed for ${ticketKey}:`, err)
    }
  }, [groupId, addTab, resolveWorktree, buildPrompt, getConfig, getFocusedGroupId])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleLoadStart = () => setIsLoading(true)
    const handleLoadStop = () => {
      setIsLoading(false)
      syncNavState()
    }

    const handleDomReady = () => {
      const wv = webviewRef.current
      if (!wv) return
      // Inject CSS
      wv.insertCSS(INJECT_CSS).catch(() => {})
      // Inject JS bridge
      wv.executeJavaScript(INJECT_JS).catch(() => {})

      // Inject Atlassian-specific script when on an atlassian.net page
      const currentUrl = wv.getURL()
      if (isAtlassianUrl(currentUrl)) {
        wv.executeJavaScript(buildAtlassianInjectScript()).catch(() => {})
      }
    }

    // Listen for console messages from the webview to receive Conductor
    // actions from the injected Atlassian script.
    const handleConsoleMessage = (e: any) => {
      const message: string = e.message
      if (!message || !message.startsWith(CONDUCTOR_MSG_PREFIX)) return
      try {
        const payload = JSON.parse(message.slice(CONDUCTOR_MSG_PREFIX.length)) as ConductorMessage
        if (payload.action && payload.ticketKey) {
          handleConductorAction(payload)
        }
      } catch { /* ignore non-JSON console messages */ }
    }

    const handleTitleUpdated = (e: any) => {
      updateTab(groupId, tabId, { title: (e.title || 'Browser').slice(0, 40) })
    }

    // Handles SPA navigations (pushState / replaceState) so the URL bar
    // stays in sync without triggering a full page reload.
    const handleInPageNavigation = (e: any) => {
      setInputUrl(e.url)
      const wv = webviewRef.current
      if (wv) {
        setCanGoBack(wv.canGoBack())
        setCanGoForward(wv.canGoForward())
      }
    }

    // Handles target="_blank" links and window.open() calls by opening
    // a new browser tab within Conductor instead of silently blocking them.
    const handleNewWindow = (e: any) => {
      const targetUrl = e.url
      if (targetUrl && targetUrl !== 'about:blank') {
        addTab(groupId, {
          type: 'browser',
          title: targetUrl.replace(/^https?:\/\//, '').slice(0, 40),
          url: targetUrl,
        })
      }
    }

    webview.addEventListener('did-start-loading', handleLoadStart)
    webview.addEventListener('did-stop-loading', handleLoadStop)
    webview.addEventListener('dom-ready', handleDomReady)
    webview.addEventListener('page-title-updated', handleTitleUpdated)
    webview.addEventListener('did-navigate-in-page', handleInPageNavigation)
    webview.addEventListener('new-window', handleNewWindow)
    webview.addEventListener('console-message', handleConsoleMessage)

    return () => {
      webview.removeEventListener('did-start-loading', handleLoadStart)
      webview.removeEventListener('did-stop-loading', handleLoadStop)
      webview.removeEventListener('dom-ready', handleDomReady)
      webview.removeEventListener('page-title-updated', handleTitleUpdated)
      webview.removeEventListener('did-navigate-in-page', handleInPageNavigation)
      webview.removeEventListener('new-window', handleNewWindow)
      webview.removeEventListener('console-message', handleConsoleMessage)
    }
  // webviewRef.current is read inside the effect body (not as a dependency) —
  // the ref is always set by the time this effect runs because React assigns
  // refs during commit, before effects fire.
  }, [syncNavState, addTab, groupId, tabId, updateTab, handleConductorAction])

  function normalizeUrl(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return 'about:blank'
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('about:')) {
      return trimmed
    }
    // If it looks like a domain
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(trimmed)) {
      return `https://${trimmed}`
    }
    // Search query
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
  }

  function navigate(rawUrl: string) {
    const normalized = normalizeUrl(rawUrl)
    setInputUrl(normalized)
    // Use loadURL only — do NOT set the src attribute, which would cause
    // React to re-render the webview element and trigger a second navigation.
    if (webviewRef.current) {
      webviewRef.current.loadURL(normalized).catch(() => {})
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    navigate(inputUrl)
  }

  function handleBack() {
    if (webviewRef.current?.canGoBack()) {
      webviewRef.current.goBack()
    }
  }

  function handleForward() {
    if (webviewRef.current?.canGoForward()) {
      webviewRef.current.goForward()
    }
  }

  function handleRefresh() {
    if (webviewRef.current) {
      if (isLoading) {
        webviewRef.current.stop()
      } else {
        webviewRef.current.reload()
      }
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950">
      {/* Browser toolbar */}
      <div className="flex items-center gap-1 px-2 h-9 bg-zinc-900/80 border-b border-zinc-700/50 shrink-0">
        <button
          onClick={handleBack}
          disabled={!canGoBack}
          className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={handleForward}
          disabled={!canGoForward}
          className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={handleRefresh}
          className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          {isLoading ? (
            <X className="w-4 h-4" />
          ) : (
            <RotateCw className="w-4 h-4" />
          )}
        </button>

        <form onSubmit={handleSubmit} className="flex-1 flex items-center">
          <div className="flex items-center flex-1 bg-zinc-800/80 border border-zinc-600/50 focus-within:border-blue-500/60 transition-colors px-2 h-6 gap-1 rounded-sm">
            <Globe className="w-3 h-3 text-zinc-400 shrink-0" />
            <input
              type="text"
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              className="flex-1 bg-transparent text-zinc-200 text-ui-base font-mono outline-none placeholder:text-zinc-500"
              placeholder="Enter URL or search..."
              onFocus={e => e.target.select()}
            />
          </div>
        </form>
      </div>

      {/* Webview */}
      <div className="flex-1 overflow-hidden relative">
        {React.createElement('webview', {
          ref: webviewRef,
          src: initialSrc,
          className: 'w-full h-full',
          partition: 'persist:browser',
          nodeintegration: 'false',
          webpreferences: 'contextIsolation=yes',
          allowpopups: 'true',
          style: { display: 'flex', width: '100%', height: '100%' }
        })}
        {/* Transparent overlay shown during tab drags and pane resizes to
            intercept mouse/drag events that the native <webview> element would
            otherwise swallow, allowing TabGroup's NESW drop zone logic and
            SplitPane/Sidebar resize handlers to receive them. */}
        {(isTabDragging || isPaneResizing) && (
          <div
            className="absolute inset-0 z-10"
            onMouseDown={() => {
              // Safety valve: if the overlay is stuck (end event was lost),
              // a click dismisses it so the user can interact with the webview.
              setIsTabDragging(false)
              setIsPaneResizing(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
