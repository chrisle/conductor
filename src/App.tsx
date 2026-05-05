import React, { useEffect, useCallback, useState } from 'react'
import TitleBar from './components/TitleBar'
import MainLayout from './components/Layout'
import Footer from './components/Footer'
import GoToDialog from './components/GoToDialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './components/ui/dialog'

import { extensionRegistry } from './extensions'
import { useSidebarStore } from './store/sidebar'
import { useTabsStore } from './store/tabs'
import { useLayoutStore } from './store/layout'
import { useProjectStore } from './store/project'
import { useActivityBarStore } from './store/activityBar'
import { useUIStore } from './store/ui'
import { useConfigStore } from './store/config'
import { useWorkSessionsStore } from './store/work-sessions'
import { initializeDefaultProject, createDefaultProject, saveProject, autosaveLayout, openProject } from './lib/project-io'
import { startUsageScraper, stopUsageScraper } from './lib/claude-usage-scraper'
import { reapOrphanTerminalSessions } from './lib/reap-orphan-sessions'
import { initHomeDir } from './lib/terminal-cwd'
import { loadExtensionsFromDevPaths } from './extensions/loader'
import { getSkillsNeedingInstall, installSkills } from './lib/skill-installer'

function App(): React.ReactElement {
  const zoom = useUIStore(s => s.zoom)
  const goToOpen = useUIStore(s => s.goToOpen)
  const setGoToOpen = useUIStore(s => s.setGoToOpen)
  const [skillsToInstall, setSkillsToInstall] = useState<{ name: string; content: string; extensionName: string }[]>([])
  const [installing, setInstalling] = useState(false)

  // Initialize config, work sessions, and home dir cache
  useEffect(() => {
    ;(async () => {
      await useConfigStore.getState().initialize()
      const devPaths = useConfigStore.getState().config.extensions.devPaths
      if (devPaths.length > 0) {
        await loadExtensionsFromDevPaths(devPaths).catch(err =>
          console.error('Failed to load dev extensions:', err)
        )
      }
      getSkillsNeedingInstall().then(pending => {
        if (pending.length > 0) setSkillsToInstall(pending)
      }).catch(() => {})
    })()
    useWorkSessionsStore.getState().initialize()
    initHomeDir()
  }, [])

  // Start Claude usage scraper (runs every 5 minutes)
  useEffect(() => {
    startUsageScraper()
    return () => stopUsageScraper()
  }, [])

  // Load persisted favorites from disk on startup
  useEffect(() => {
    window.electronAPI.loadFavorites().then((favs: string[]) => {
      if (favs.length > 0) {
        useSidebarStore.setState({ favorites: favs })
      }
    })
  }, [])

  // Initialize project: new windows get a fresh project, otherwise restore last session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const init = params.get('newWindow') === '1'
      ? Promise.resolve(createDefaultProject())
      : initializeDefaultProject()
    // After tabs are restored, reap any conductord sessions that no longer
    // map to a tab (orphans left behind by soft-close).
    init.then(() => reapOrphanTerminalSessions())
  }, [])

  // Auto-save when tabs or layout change (debounced)
  useEffect(() => {
    let initialized = false
    let saveTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleAutoSave = () => {
      if (!initialized) return
      const { filePath } = useProjectStore.getState()
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        if (filePath) {
          saveProject(filePath).catch(() => {})
        } else {
          autosaveLayout()
        }
      }, 500)
    }

    const unsubTabs = useTabsStore.subscribe(scheduleAutoSave)
    const unsubLayout = useLayoutStore.subscribe(scheduleAutoSave)
    requestAnimationFrame(() => { initialized = true })
    return () => {
      unsubTabs()
      unsubLayout()
      if (saveTimer) clearTimeout(saveTimer)
    }
  }, [])

  // Sync the file explorer's rootPath to the focused tab's cwd. Each terminal-like
  // tab (claude-code/codex/terminal) carries its working directory in `tab.filePath`;
  // switching tabs should make the file tree follow. Skip while in git virtual mode
  // so that browsing a ref isn't disrupted by tab activations.
  // Only re-sync on actual tab switches — not on every tab-store mutation (thinking
  // state, drag, etc.) — so manual sidebar navigation isn't overridden mid-session.
  useEffect(() => {
    let lastKey: string | null = null
    const syncRootPath = () => {
      if (useSidebarStore.getState().gitRef) return
      const focusedGroupId = useLayoutStore.getState().focusedGroupId
      if (!focusedGroupId) return
      const group = useTabsStore.getState().groups[focusedGroupId]
      if (!group || !group.activeTabId) return
      const activeTab = group.tabs.find(t => t.id === group.activeTabId)
      if (!activeTab || !activeTab.filePath) return
      if (!['claude-code', 'codex', 'terminal'].includes(activeTab.type)) return
      const key = `${focusedGroupId}:${activeTab.id}:${activeTab.filePath}`
      if (key === lastKey) return
      lastKey = key
      const current = useSidebarStore.getState().rootPath
      if (current !== activeTab.filePath) {
        useSidebarStore.getState().setRootPath(activeTab.filePath)
      }
    }
    syncRootPath()
    const unsubLayout = useLayoutStore.subscribe(syncRootPath)
    const unsubTabs = useTabsStore.subscribe(syncRootPath)
    return () => { unsubLayout(); unsubTabs() }
  }, [])

  // Listen for Cmd+W routed from the Electron menu as "close tab" instead of "close window".
  // Closes the active tab in the focused group; if no tabs remain, closes the window.
  // Guard against duplicate IPC events within a short window (macOS can fire twice).
  useEffect(() => {
    let lastCloseTime = 0
    const callback = () => {
      const now = Date.now()
      if (now - lastCloseTime < 100) return
      lastCloseTime = now

      const { focusedGroupId } = useLayoutStore.getState()
      if (!focusedGroupId) {
        window.electronAPI.close()
        return
      }
      const group = useTabsStore.getState().groups[focusedGroupId]
      if (!group || !group.activeTabId) {
        window.electronAPI.close()
        return
      }

      useTabsStore.getState().removeTab(focusedGroupId, group.activeTabId)

      // If the group is now empty and there are other groups, remove the empty group
      const updatedGroup = useTabsStore.getState().groups[focusedGroupId]
      if (updatedGroup && updatedGroup.tabs.length === 0) {
        const allGroupIds = Object.keys(useTabsStore.getState().groups)
        if (allGroupIds.length > 1) {
          useLayoutStore.getState().removeGroup(focusedGroupId)
          useTabsStore.getState().removeGroup(focusedGroupId)
        }
      }
    }
    const handler = window.electronAPI.onCloseTabRequested(callback)
    return () => window.electronAPI.offCloseTabRequested(handler)
  }, [])

  // Listen for .conductor files opened via Finder / file manager
  useEffect(() => {
    const handler = window.electronAPI.onOpenFile((filePath: string) => {
      openProject(filePath)
    })
    return () => window.electronAPI.offOpenFile(handler)
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const shortcuts = useConfigStore.getState().config.customization.keyboardShortcuts
    const getKeys = (id: string) => {
      const s = shortcuts.find(s => s.id === id)
      return s?.keys ?? ''
    }

    const matchesShortcut = (id: string): boolean => {
      const keys = getKeys(id)
      if (!keys) return false
      const parts = keys.split('+').map(p => p.trim().toLowerCase())
      const needsMeta = parts.includes('meta') || parts.includes('cmd')
      const needsCtrl = parts.includes('ctrl') || parts.includes('control')
      const needsShift = parts.includes('shift')
      const needsAlt = parts.includes('alt')
      const keyPart = parts.filter(p => !['meta', 'cmd', 'ctrl', 'control', 'shift', 'alt'].includes(p))[0] ?? ''

      if (needsMeta && !e.metaKey) return false
      if (needsCtrl && !e.ctrlKey) return false
      if (needsShift && !e.shiftKey) return false
      if (needsAlt && !e.altKey) return false
      if (!needsMeta && e.metaKey && keyPart !== '') return false
      if (!needsShift && e.shiftKey) return false

      return e.key.toLowerCase() === keyPart || e.key === keyPart
    }

    if (matchesShortcut('goToFile')) {
      e.preventDefault()
      setGoToOpen(!useUIStore.getState().goToOpen)
      return
    }

    if (matchesShortcut('nextTab') || matchesShortcut('prevTab')) {
      e.preventDefault()
      const groupId = useLayoutStore.getState().focusedGroupId
      if (!groupId) return
      const group = useTabsStore.getState().groups[groupId]
      if (!group || group.tabs.length < 2) return
      const idx = group.tabs.findIndex(t => t.id === group.activeTabId)
      const delta = matchesShortcut('prevTab') ? -1 : 1
      const next = (idx + delta + group.tabs.length) % group.tabs.length
      useTabsStore.getState().setActiveTab(groupId, group.tabs[next].id)
      return
    }

    if (matchesShortcut('toggleSidebar')) {
      e.preventDefault()
      useActivityBarStore.getState().toggleSidebar()
      return
    }

    if (matchesShortcut('zoomIn')) {
      e.preventDefault()
      useUIStore.getState().zoomIn()
      return
    }
    if (matchesShortcut('zoomOut')) {
      e.preventDefault()
      useUIStore.getState().zoomOut()
      return
    }
    if (matchesShortcut('zoomReset')) {
      e.preventDefault()
      useUIStore.getState().resetZoom()
      return
    }

    // Panel switching: Meta+1 through Meta+9 toggle sidebar panels by position.
    // Works dynamically for any number of registered sidebar extensions.
    if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key >= '1' && e.key <= '9') {
      const i = parseInt(e.key, 10)
      const sidebarExtensions = extensionRegistry.getSidebarExtensions()
      // Exclude settings since it opens a dialog, not a sidebar
      const panels = sidebarExtensions.filter(ext => ext.id !== 'settings')
      if (i <= panels.length) {
        e.preventDefault()
        useActivityBarStore.getState().toggleExtension(panels[i - 1].id)
      }
      return
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      className="flex flex-col h-full w-full bg-zinc-950 overflow-hidden"
      style={{
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        width: `${100 / zoom}%`,
        height: `${100 / zoom}%`,
      }}
    >
      <TitleBar />
      <div className="flex-1 overflow-hidden">
        <MainLayout />
      </div>
      <Footer />
      <GoToDialog open={goToOpen} onOpenChange={setGoToOpen} />
      <Dialog open={skillsToInstall.length > 0} onOpenChange={() => setSkillsToInstall([])}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">Install Extension Skills</DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              The following Claude Code skills need to be installed or updated in{' '}
              <code className="text-zinc-300">~/.claude/skills/</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <ul className="text-xs space-y-2">
              {skillsToInstall.map(skill => (
                <li key={skill.name}>
                  <span className="text-zinc-500">from </span>
                  <span className="text-zinc-300">{skill.extensionName}</span>
                  <div className="font-mono text-zinc-500 mt-0.5">{skill.name}</div>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter className="gap-2">
            <button
              className="px-3 py-1.5 text-xs rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
              onClick={() => setSkillsToInstall([])}
              disabled={installing}
            >
              Skip
            </button>
            <button
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
              disabled={installing}
              onClick={async () => {
                setInstalling(true)
                try {
                  await installSkills(skillsToInstall)
                } finally {
                  setInstalling(false)
                  setSkillsToInstall([])
                }
              }}
            >
              {installing ? 'Installing…' : 'Install / Update'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App
