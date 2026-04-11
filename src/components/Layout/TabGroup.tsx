import React, { useState, useEffect, useRef } from 'react'
import { X, Plus, FileText, FolderOpen, FilePlus2, RotateCw, Pencil, Skull, LayoutGrid, Columns3, Rows3, UserCircle, Check, StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator as CtxMenuSeparator, ContextMenuTrigger, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuLabel } from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTabsStore, type Tab } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import { extensionRegistry } from '@/extensions'
import { openProjectDialog, openProject, createDefaultProject } from '@/lib/project-io'
import { useProjectStore } from '@/store/project'
import { useConfigStore } from '@/store/config'
import { resolveTerminalCwd, saveTerminalCwd } from '@/lib/terminal-cwd'
import { useSettingsDialogStore } from '@/store/settingsDialog'
import { killTerminal } from '@/lib/terminal-api'
import { buildTileLayout, type TileMode } from '@/lib/tile-layout'
import { nextSessionId } from '@/lib/session-id'
import { setSessionTitle } from '@/lib/session-titles'
import ClaudeIcon from '@/components/ui/ClaudeIcon'
import CodexIcon from '@/components/ui/CodexIcon'
import { useNotificationsStore } from '@/store/notifications'
import { Terminal, Globe } from 'lucide-react'

interface TabGroupProps {
  groupId: string
}

type DropZone = 'north' | 'south' | 'east' | 'west' | null

const DRAGGING_TAB_KEY = '__dragging_tab__'
const DRAGGING_GROUP_KEY = '__dragging_group__'

function RecentProjects() {
  const recentProjects = useProjectStore(s => s.recentProjects)
  const currentPath = useProjectStore(s => s.filePath)
  const loadRecentProjects = useProjectStore(s => s.loadRecentProjects)

  useEffect(() => { loadRecentProjects() }, [])

  const filtered = recentProjects.filter(p => p.path !== currentPath)
  if (filtered.length === 0) return null

  const friendly = (p: string) => p.replace(/^\/Users\/[^/]+/, '~')

  return (
    <div className="flex flex-col gap-1.5 mt-4 w-full max-w-xs">
      <div className="text-ui-sm text-zinc-500 uppercase tracking-wider px-1">Recent Projects</div>
      {filtered.map(p => (
        <button
          key={p.path}
          onClick={() => openProject(p.path)}
          className="flex flex-col gap-0.5 px-2 py-1.5 rounded text-left hover:bg-zinc-800/50 transition-colors group"
        >
          <span className="text-ui-base text-zinc-300 group-hover:text-zinc-100 truncate">{p.name}</span>
          <span className="text-ui-xs text-zinc-500 truncate">{friendly(p.path)}</span>
        </button>
      ))}
    </div>
  )
}

function EmptyState({ groupId, renderContextMenuItems }: { groupId: string, renderContextMenuItems: () => React.ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex flex-col items-center justify-center h-full gap-6">
          <div className="text-ui-xl font-light text-zinc-300 tracking-wide">Conductor</div>
          <div className="flex gap-4">
            <button
              onClick={() => openProjectDialog()}
              className="flex flex-col items-center gap-3 w-40 py-6 rounded-lg border border-zinc-700/60 bg-zinc-900/50 hover:bg-zinc-800/60 hover:border-zinc-600 transition-colors group"
            >
              <FolderOpen className="w-8 h-8 text-zinc-500 group-hover:text-blue-400 transition-colors" />
              <span className="text-ui-base text-zinc-400 group-hover:text-zinc-200 transition-colors">Open Project</span>
            </button>
            <button
              onClick={() => createDefaultProject()}
              className="flex flex-col items-center gap-3 w-40 py-6 rounded-lg border border-zinc-700/60 bg-zinc-900/50 hover:bg-zinc-800/60 hover:border-zinc-600 transition-colors group"
            >
              <FilePlus2 className="w-8 h-8 text-zinc-500 group-hover:text-blue-400 transition-colors" />
              <span className="text-ui-base text-zinc-400 group-hover:text-zinc-200 transition-colors">New Project</span>
            </button>
          </div>
          <RecentProjects />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44 bg-zinc-900 border-zinc-700">
        {renderContextMenuItems()}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function TabIcon({ type }: { type: string }) {
  const Icon = extensionRegistry.getTabIcon(type)
  if (!Icon) return <FileText className="w-3 h-3" />
  const iconClassName = extensionRegistry.getTabIconClassName(type) || 'w-3 h-3'
  return <Icon className={iconClassName} />
}

function TabBadge({ tabId }: { tabId: string }) {
  const count = useNotificationsStore(s => s.tabBadges[tabId] || 0)
  if (count === 0) return null
  return (
    <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-blue-500 text-white text-[10px] font-medium flex items-center justify-center leading-none">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function TabGroup({ groupId }: TabGroupProps): React.ReactElement {
  const { groups, setActiveTab, removeTab, addTab, moveTab } = useTabsStore()
  const selectedTabIds = useTabsStore(s => s.selectedTabIds[groupId])
  const { focusedGroupId, setFocusedGroup, insertPanel, removeGroup, getAllGroupIds } = useLayoutStore()
  const group = groups[groupId]

  const [dropZone, setDropZone] = useState<DropZone>(null)
  const dropZoneRef = useRef<DropZone>(null)
  const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null)
  const [isDraggingTab, setIsDraggingTab] = useState(false)
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false)
  const [floatingMenuOpen, setFloatingMenuOpen] = useState(false)
  const [floatingMenuPos, setFloatingMenuPos] = useState({ x: 0, y: 0 })
  const [floatingSubmenu, setFloatingSubmenu] = useState<'claude' | 'browser' | null>(null)
  const floatingAnchorRef = useRef<HTMLDivElement>(null)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [noteEditTabId, setNoteEditTabId] = useState<string | null>(null)
  const [noteEditValue, setNoteEditValue] = useState('')
  const tabBarRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dragIndexRef = useRef<number | null>(null)
  const contentDragRafRef = useRef<number | null>(null)
  const mousePos = useRef({ x: 0, y: 0 })
  const { rootPath } = useSidebarStore()
  const isFocused = focusedGroupId === groupId

  // Track mouse position for Cmd+T
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      mousePos.current = { x: e.clientX, y: e.clientY }
    }
    document.addEventListener('mousemove', onMouseMove)
    return () => document.removeEventListener('mousemove', onMouseMove)
  }, [])

  // Cmd+T opens new tab menu at mouse position
  useEffect(() => {
    if (!isFocused) return
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        setFloatingMenuPos(mousePos.current)
        setFloatingMenuOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isFocused])

  // Cmd+W close-tab is handled globally via the Electron menu accelerator
  // (see App.tsx tab:closeRequested listener) so no keydown handler is needed here.

  const claudeAccounts = useConfigStore(s => s.config.claudeAccounts)
  const defaultClaudeAccountId = useConfigStore(s => s.config.defaultClaudeAccountId)
  const projectSettings = useProjectStore(s => s.projectSettings)
  const setProjectSettings = useProjectStore(s => s.setProjectSettings)

  // Effective default: project-level overrides global
  const effectiveDefaultAccountId =
    projectSettings?.defaultClaudeAccountId !== undefined
      ? projectSettings.defaultClaudeAccountId
      : defaultClaudeAccountId

  function addClaudeTab(apiKey?: string, accountName?: string) {
    const cwd = rootPath || undefined
    const id = nextSessionId('claude-code')
    // If no explicit account is given, use the effective default (project → global)
    let resolvedApiKey = apiKey
    let resolvedName = accountName
    if (resolvedApiKey === undefined && effectiveDefaultAccountId) {
      const defaultAccount = claudeAccounts.find(a => a.id === effectiveDefaultAccountId)
      if (defaultAccount) {
        resolvedApiKey = defaultAccount.apiKey
        resolvedName = defaultAccount.name
      }
    }
    useTabsStore.getState().addTab(groupId, {
      id,
      type: 'claude-code',
      title: resolvedName ? `${id} (${resolvedName})` : id,
      filePath: cwd,
      initialCommand: 'claude\n',
      apiKey: resolvedApiKey,
    })
  }

  function setProjectDefaultAccount(id: string | null) {
    setProjectSettings({ ...projectSettings, defaultClaudeAccountId: id })
    useProjectStore.getState().markWorkspaceDirty()
  }

  // Get menu items from plugin registry (for third-party extensions)
  const menuItems = extensionRegistry.getNewTabMenuItems()
  // Filter out built-in items we render ourselves
  const extraMenuItems = menuItems.filter(item =>
    !['Claude Code', 'Claude Code (continue)', 'Claude Code (resume)', 'Codex', 'Terminal', 'Browser'].includes(item.label)
  )

  // Keyboard number shortcuts for the floating menu
  useEffect(() => {
    if (!floatingMenuOpen) {
      setFloatingSubmenu(null)
      return
    }
    function onKeyDown(e: KeyboardEvent) {
      const n = parseInt(e.key)
      if (isNaN(n) || n < 1) return
      e.preventDefault()
      e.stopPropagation()

      if (floatingSubmenu === 'claude') {
        if (n === 1) {
          addClaudeTab()
          setFloatingMenuOpen(false)
        } else {
          const account = claudeAccounts[n - 2]
          if (account) {
            addClaudeTab(account.apiKey, account.name)
            setFloatingMenuOpen(false)
          }
        }
        return
      }

      if (floatingSubmenu === 'browser') {
        if (n === 1) {
          useTabsStore.getState().addTab(groupId, { type: 'browser', title: 'Browser', url: 'https://google.com' })
          setFloatingMenuOpen(false)
        } else if (n === 2) {
          window.electronAPI.openExternal('https://google.com')
          setFloatingMenuOpen(false)
        }
        return
      }

      // Top level: 1=Claude, 2=Codex, 3=Terminal, 4=Browser, 5+=extras
      if (n === 1) {
        setFloatingSubmenu('claude')
      } else if (n === 2) {
        const cwd = rootPath || undefined
        const codexId = nextSessionId('codex')
        useTabsStore.getState().addTab(groupId, { id: codexId, type: 'codex', title: codexId, filePath: cwd, initialCommand: 'codex\n' })
        setFloatingMenuOpen(false)
      } else if (n === 3) {
        const cwd = resolveTerminalCwd()
        saveTerminalCwd(cwd)
        useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'Terminal', filePath: cwd })
        setFloatingMenuOpen(false)
      } else if (n === 4) {
        setFloatingSubmenu('browser')
      } else {
        const extra = extraMenuItems[n - 5]
        if (extra) {
          extra.action(groupId)
          setFloatingMenuOpen(false)
        }
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [floatingMenuOpen, floatingSubmenu, claudeAccounts, rootPath, groupId, extraMenuItems])

  // Global dragend listener — ensures isDraggingTab resets even when the
  // per-element dragend doesn't fire (e.g. source tab removed from DOM mid-drag).
  useEffect(() => {
    if (!isDraggingTab) return
    const reset = () => setIsDraggingTab(false)
    window.addEventListener('dragend', reset)
    return () => window.removeEventListener('dragend', reset)
  }, [isDraggingTab])

  if (!group) return <div className="h-full w-full bg-zinc-950" />

  const activeTab = group.tabs.find(t => t.id === group.activeTabId)

  // --- Tab bar drag (reorder within group or move between groups) ---
  function handleTabDragStart(e: React.DragEvent, tab: Tab, index: number) {
    dragIndexRef.current = index
    e.dataTransfer.setData(DRAGGING_TAB_KEY, tab.id)
    e.dataTransfer.setData(DRAGGING_GROUP_KEY, groupId)
    e.dataTransfer.effectAllowed = 'move'
    setIsDraggingTab(true)
  }

  function handleTabDragEnd() {
    setIsDraggingTab(false)
    setDragOverTabIndex(null)
  }

  function handleTabDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverTabIndex(prev => prev === index ? prev : index)
  }

  function handleTabDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault()
    e.stopPropagation()
    const tabId = e.dataTransfer.getData(DRAGGING_TAB_KEY)
    const sourceGroupId = e.dataTransfer.getData(DRAGGING_GROUP_KEY)
    setDragOverTabIndex(null)
    setIsDraggingTab(false)

    if (!tabId) return

    if (sourceGroupId === groupId) {
      const sourceIndex = group.tabs.findIndex(t => t.id === tabId)
      if (sourceIndex !== -1 && sourceIndex !== targetIndex) {
        useTabsStore.getState().reorderTab(groupId, sourceIndex, targetIndex)
      }
    } else {
      moveTab(sourceGroupId, tabId, groupId, targetIndex)

      // Clean up the source pane if dragging away its last tab
      setTimeout(() => {
        const src = useTabsStore.getState().groups[sourceGroupId]
        if (src && src.tabs.length === 0 && sourceGroupId !== groupId) {
          removeGroup(sourceGroupId)
          useTabsStore.getState().removeGroup(sourceGroupId)
        }
      }, 0)
    }
  }

  // --- Content area drop (split screen) ---
  function calcDropZone(clientX: number, clientY: number): DropZone {
    const rect = contentRef.current?.getBoundingClientRect()
    if (!rect) return null
    const distances = {
      west: clientX - rect.left,
      east: rect.right - clientX,
      north: clientY - rect.top,
      south: rect.bottom - clientY,
    }
    return (Object.keys(distances) as NonNullable<DropZone>[]).reduce((a, b) =>
      distances[a] < distances[b] ? a : b
    )
  }

  function handleContentDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    // When entering the content area for the first time (dropZone is null),
    // show the highlight immediately — no rAF delay. This matters most for
    // browser tabs where the overlay may miss the very first dragover event.
    if (dropZoneRef.current === null) {
      const zone = calcDropZone(e.clientX, e.clientY)
      if (zone !== null) {
        dropZoneRef.current = zone
        setDropZone(zone)
      }
      return
    }

    // Already showing — throttle to one update per animation frame so we
    // don't re-render at 60fps while the cursor moves within the same zone.
    if (contentDragRafRef.current !== null) return
    const clientX = e.clientX
    const clientY = e.clientY
    contentDragRafRef.current = requestAnimationFrame(() => {
      contentDragRafRef.current = null
      const zone = calcDropZone(clientX, clientY)
      if (zone !== dropZoneRef.current) {
        dropZoneRef.current = zone
        setDropZone(zone)
      }
    })
  }

  function handleContentDragLeave(e: React.DragEvent) {
    if (contentDragRafRef.current !== null) {
      cancelAnimationFrame(contentDragRafRef.current)
      contentDragRafRef.current = null
    }
    if (!contentRef.current?.contains(e.relatedTarget as Node)) {
      dropZoneRef.current = null
      setDropZone(null)
    }
  }

  function handleContentDrop(e: React.DragEvent) {
    e.preventDefault()
    // Stop propagation so the event doesn't bubble to the parent content div
    // and fire this handler twice (once from the overlay, once from the parent).
    // A double-fire creates a second empty group in the layout (CON-85).
    e.stopPropagation()
    if (contentDragRafRef.current !== null) {
      cancelAnimationFrame(contentDragRafRef.current)
      contentDragRafRef.current = null
    }
    const tabId = e.dataTransfer.getData(DRAGGING_TAB_KEY)
    const sourceGroupId = e.dataTransfer.getData(DRAGGING_GROUP_KEY)
    const zone = dropZone
    dropZoneRef.current = null
    setDropZone(null)
    setIsDraggingTab(false)

    if (!tabId || !zone) return

    const newGroupId = useTabsStore.getState().createGroup()
    insertPanel(groupId, zone, newGroupId)
    moveTab(sourceGroupId, tabId, newGroupId)

    setTimeout(() => {
      const src = useTabsStore.getState().groups[sourceGroupId]
      if (src && src.tabs.length === 0) {
        const remaining = Object.keys(useTabsStore.getState().groups)
        if (remaining.length > 1) {
          removeGroup(sourceGroupId)
          useTabsStore.getState().removeGroup(sourceGroupId)
        }
      }
    }, 0)
  }

  function isTerminalLike(type: string): boolean {
    return type === 'terminal' || type === 'claude-code' || type === 'codex'
  }

  function refreshTab(tab: Tab) {
    if (isTerminalLike(tab.type)) {
      killTerminal(tab.id)
    }
    useTabsStore.getState().updateTab(groupId, tab.id, {
      refreshKey: (tab.refreshKey || 0) + 1,
    })
  }

  function closeTab(tabId: string) {
    const groupTabs = group.tabs
    removeTab(groupId, tabId)
    if (groupTabs.length === 1) {
      const allIds = getAllGroupIds()
      if (allIds.length > 1) {
        setTimeout(() => {
          removeGroup(groupId)
          useTabsStore.getState().removeGroup(groupId)
        }, 0)
      }
    }
  }

  function killAndCloseTab(tabId: string) {
    const tab = group.tabs.find(t => t.id === tabId)
    if (tab && isTerminalLike(tab.type)) {
      killTerminal(tabId)
    }
    closeTab(tabId)
  }

  function handleCloseTab(e: React.MouseEvent, tabId: string) {
    e.stopPropagation()
    closeTab(tabId)
  }

  // --- Multi-select actions ---

  function getEffectiveSelection(contextTabId: string): string[] {
    // If the right-clicked tab is in the selection, use the full selection.
    // Otherwise treat it as if only that tab was selected.
    const sel = useTabsStore.getState().getSelectedTabIds(groupId)
    if (sel.includes(contextTabId)) return sel
    return [contextTabId]
  }

  function closeSelectedTabs(contextTabId: string) {
    const ids = getEffectiveSelection(contextTabId)
    useTabsStore.getState().clearSelection(groupId)
    // Close in reverse order to avoid index shifting issues
    for (const id of [...ids].reverse()) {
      closeTab(id)
    }
  }

  function killSelectedTabs(contextTabId: string) {
    const ids = getEffectiveSelection(contextTabId)
    useTabsStore.getState().clearSelection(groupId)
    for (const id of [...ids].reverse()) {
      killAndCloseTab(id)
    }
  }

  // Tile selected tabs into columns, rows, or a grid layout
  function tileSelectedTabs(contextTabId: string, mode: TileMode) {
    const ids = getEffectiveSelection(contextTabId)
    if (ids.length < 2) return
    useTabsStore.getState().clearSelection(groupId)
    // First tab stays in current group; remaining tabs each get a new group
    const allGroupIds = [groupId]
    for (let i = 1; i < ids.length; i++) {
      const newGroupId = useTabsStore.getState().createGroup()
      moveTab(groupId, ids[i], newGroupId)
      allGroupIds.push(newGroupId)
    }
    // Build layout tree for the chosen mode and replace this group's leaf
    const tree = buildTileLayout(allGroupIds, mode)
    useLayoutStore.getState().replaceLeaf(groupId, tree)
  }

  function handleContentClick() {
    setFocusedGroup(groupId)
  }

  function startRename(tab: Tab) {
    setRenamingTabId(tab.id)
    setRenameValue(tab.title)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  function commitRename() {
    if (renamingTabId && renameValue.trim()) {
      const title = renameValue.trim()
      useTabsStore.getState().updateTab(groupId, renamingTabId, { title })
      const tab = group.tabs.find(t => t.id === renamingTabId)
      if (tab && isTerminalLike(tab.type)) {
        setSessionTitle(renamingTabId, title)
      }
    }
    setRenamingTabId(null)
  }

  function startEditNote(tab: Tab) {
    setNoteEditTabId(tab.id)
    setNoteEditValue(tab.note ?? '')
  }

  function commitNote() {
    if (!noteEditTabId) return
    const trimmed = noteEditValue.trim()
    useTabsStore.getState().updateTab(groupId, noteEditTabId, {
      note: trimmed === '' ? undefined : trimmed,
    })
    setNoteEditTabId(null)
    setNoteEditValue('')
  }

  function cancelEditNote() {
    setNoteEditTabId(null)
    setNoteEditValue('')
  }

  const friendly = (p: string) => p.replace(/^\/Users\/[^/]+/, '~')

  function NumberHint({ n }: { n: number }) {
    return (
      <span className="text-[10px] text-zinc-500 font-mono leading-none order-first [[data-highlighted]_&]:text-white">{n}</span>
    )
  }

  function renderMenuItems(onDone: () => void, showHints = false) {
    const builtinCount = 4 // Claude, Codex, Terminal, Browser
    return (
      <>
        {/* Current directory */}
        <DropdownMenuLabel className="text-ui-xs text-zinc-500 font-normal py-0.5">
          Current directory
        </DropdownMenuLabel>
        <DropdownMenuLabel className="text-ui-xs text-zinc-400 font-normal truncate max-w-[200px] py-0.5 -mt-1">
          {rootPath ? friendly(rootPath) : 'No project'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Claude submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-ui-base cursor-pointer">
            <ClaudeIcon className="w-3.5 h-3.5 text-[#D97757] shrink-0" />
            <span>Claude</span>
            {showHints && <NumberHint n={1} />}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="bg-zinc-900 border-zinc-700 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
            <DropdownMenuLabel className="text-ui-xs text-zinc-500 font-normal py-0.5">Claude Accounts</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => { addClaudeTab(); onDone() }}
              className="gap-2 text-ui-base cursor-pointer"
            >
              Default
              {showHints && <NumberHint n={1} />}
            </DropdownMenuItem>
            {claudeAccounts.length > 0 && <DropdownMenuSeparator />}
            {claudeAccounts.map((account, i) => (
              <DropdownMenuItem
                key={account.id}
                onClick={() => { addClaudeTab(account.apiKey, account.name); onDone() }}
                className="gap-2 text-ui-base cursor-pointer"
              >
                {account.name}
                {showHints && <NumberHint n={i + 2} />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => { useSettingsDialogStore.getState().openToSection('ai-cli') }}
              className="gap-2 text-ui-base cursor-pointer text-zinc-400"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Account</span>
            </DropdownMenuItem>
            {claudeAccounts.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2 text-ui-base cursor-pointer text-zinc-400">
                    <UserCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Project Default</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-zinc-900 border-zinc-700">
                    <DropdownMenuLabel className="text-ui-xs text-zinc-500 font-normal py-0.5">Default for this project</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => { setProjectDefaultAccount(null); onDone() }}
                      className="gap-2 text-ui-base cursor-pointer"
                    >
                      {effectiveDefaultAccountId == null && <Check className="w-3.5 h-3.5 text-blue-400" />}
                      {effectiveDefaultAccountId != null && <span className="w-3.5" />}
                      Use Global Default
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {claudeAccounts.map(account => (
                      <DropdownMenuItem
                        key={account.id}
                        onClick={() => { setProjectDefaultAccount(account.id); onDone() }}
                        className="gap-2 text-ui-base cursor-pointer"
                      >
                        {effectiveDefaultAccountId === account.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
                        {effectiveDefaultAccountId !== account.id && <span className="w-3.5" />}
                        {account.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Codex */}
        <DropdownMenuItem
          onClick={() => {
            const cwd = rootPath || undefined
            const codexId = nextSessionId('codex')
            useTabsStore.getState().addTab(groupId, {
              id: codexId,
              type: 'codex',
              title: codexId,
              filePath: cwd,
              initialCommand: 'codex\n',
            })
            onDone()
          }}
          className="gap-2 text-ui-base cursor-pointer"
        >
          <CodexIcon className="w-3.5 h-3.5 text-[#10a37f] shrink-0" />
          <span>Codex</span>
          {showHints && <NumberHint n={2} />}
        </DropdownMenuItem>

        {/* Terminal */}
        <DropdownMenuItem
          onClick={() => {
            const cwd = resolveTerminalCwd()
            saveTerminalCwd(cwd)
            useTabsStore.getState().addTab(groupId, {
              type: 'terminal',
              title: 'Terminal',
              filePath: cwd,
            })
            onDone()
          }}
          className="gap-2 text-ui-base cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5 text-green-400 shrink-0" />
          <span>Terminal</span>
          {showHints && <NumberHint n={3} />}
        </DropdownMenuItem>

        {/* Browser submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-ui-base cursor-pointer">
            <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>Browser</span>
            {showHints && <NumberHint n={4} />}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="bg-zinc-900 border-zinc-700">
            <DropdownMenuItem
              onClick={() => {
                useTabsStore.getState().addTab(groupId, {
                  type: 'browser',
                  title: 'Browser',
                  url: 'https://google.com',
                })
                onDone()
              }}
              className="gap-2 text-ui-base cursor-pointer"
            >
              Internal
              {showHints && <NumberHint n={1} />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.electronAPI.openExternal('https://google.com')
                onDone()
              }}
              className="gap-2 text-ui-base cursor-pointer"
            >
              System
              {showHints && <NumberHint n={2} />}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Extra items from third-party extensions */}
        {extraMenuItems.length > 0 && <DropdownMenuSeparator />}
        {extraMenuItems.map((item, i) => (
          <DropdownMenuItem
            key={i}
            onClick={() => { item.action(groupId); onDone() }}
            className="gap-2 text-ui-base cursor-pointer"
          >
            <item.icon className={item.iconClassName || "w-3.5 h-3.5 shrink-0"} />
            <span>{item.label}</span>
            {showHints && <NumberHint n={builtinCount + i + 1} />}
          </DropdownMenuItem>
        ))}
      </>
    )
  }

  function renderContextMenuItems() {
    return (
      <>
        {/* Current directory */}
        <ContextMenuLabel className="text-ui-xs text-zinc-500 font-normal py-0.5">
          Current directory
        </ContextMenuLabel>
        <ContextMenuLabel className="text-ui-xs text-zinc-400 font-normal truncate max-w-[200px] py-0.5 -mt-1">
          {rootPath ? friendly(rootPath) : 'No project'}
        </ContextMenuLabel>
        <CtxMenuSeparator className="bg-zinc-700" />

        {/* Claude submenu */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2 text-ui-base cursor-pointer">
            <ClaudeIcon className="w-3.5 h-3.5 text-[#D97757] shrink-0" />
            <span>Claude</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="bg-zinc-900 border-zinc-700">
            <ContextMenuLabel className="text-ui-xs text-zinc-500 font-normal py-0.5">Claude Accounts</ContextMenuLabel>
            <CtxMenuSeparator className="bg-zinc-700" />
            <ContextMenuItem
              onClick={() => addClaudeTab()}
              className="gap-2 text-ui-base cursor-pointer"
            >
              Default
            </ContextMenuItem>
            {claudeAccounts.length > 0 && <CtxMenuSeparator className="bg-zinc-700" />}
            {claudeAccounts.map(account => (
              <ContextMenuItem
                key={account.id}
                onClick={() => addClaudeTab(account.apiKey, account.name)}
                className="gap-2 text-ui-base cursor-pointer"
              >
                {account.name}
              </ContextMenuItem>
            ))}
            <CtxMenuSeparator className="bg-zinc-700" />
            <ContextMenuItem
              onClick={() => useSettingsDialogStore.getState().openToSection('ai-cli')}
              className="gap-2 text-ui-base cursor-pointer text-zinc-400"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Account</span>
            </ContextMenuItem>
            {claudeAccounts.length > 0 && (
              <>
                <CtxMenuSeparator className="bg-zinc-700" />
                <ContextMenuSub>
                  <ContextMenuSubTrigger className="gap-2 text-ui-base cursor-pointer text-zinc-400">
                    <UserCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Project Default</span>
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="bg-zinc-900 border-zinc-700">
                    <ContextMenuLabel className="text-ui-xs text-zinc-500 font-normal py-0.5">Default for this project</ContextMenuLabel>
                    <CtxMenuSeparator className="bg-zinc-700" />
                    <ContextMenuItem
                      onClick={() => setProjectDefaultAccount(null)}
                      className="gap-2 text-ui-base cursor-pointer"
                    >
                      {effectiveDefaultAccountId == null && <Check className="w-3.5 h-3.5 text-blue-400" />}
                      {effectiveDefaultAccountId != null && <span className="w-3.5" />}
                      Use Global Default
                    </ContextMenuItem>
                    <CtxMenuSeparator className="bg-zinc-700" />
                    {claudeAccounts.map(account => (
                      <ContextMenuItem
                        key={account.id}
                        onClick={() => setProjectDefaultAccount(account.id)}
                        className="gap-2 text-ui-base cursor-pointer"
                      >
                        {effectiveDefaultAccountId === account.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
                        {effectiveDefaultAccountId !== account.id && <span className="w-3.5" />}
                        {account.name}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              </>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>

        {/* Codex */}
        <ContextMenuItem
          onClick={() => {
            const cwd = rootPath || undefined
            const codexId = nextSessionId('codex')
            useTabsStore.getState().addTab(groupId, {
              id: codexId,
              type: 'codex',
              title: codexId,
              filePath: cwd,
              initialCommand: 'codex\n',
            })
          }}
          className="gap-2 text-ui-base cursor-pointer"
        >
          <CodexIcon className="w-3.5 h-3.5 text-[#10a37f] shrink-0" />
          <span>Codex</span>
        </ContextMenuItem>

        {/* Terminal */}
        <ContextMenuItem
          onClick={() => {
            const cwd = resolveTerminalCwd()
            saveTerminalCwd(cwd)
            useTabsStore.getState().addTab(groupId, {
              type: 'terminal',
              title: 'Terminal',
              filePath: cwd,
            })
          }}
          className="gap-2 text-ui-base cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5 text-green-400 shrink-0" />
          <span>Terminal</span>
        </ContextMenuItem>

        {/* Browser submenu */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2 text-ui-base cursor-pointer">
            <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>Browser</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="bg-zinc-900 border-zinc-700">
            <ContextMenuItem
              onClick={() => {
                useTabsStore.getState().addTab(groupId, {
                  type: 'browser',
                  title: 'Browser',
                  url: 'https://google.com',
                })
              }}
              className="gap-2 text-ui-base cursor-pointer"
            >
              Internal
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                window.electronAPI.openExternal('https://google.com')
              }}
              className="gap-2 text-ui-base cursor-pointer"
            >
              System
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        {/* Extra items from third-party extensions */}
        {extraMenuItems.length > 0 && <CtxMenuSeparator className="bg-zinc-700" />}
        {extraMenuItems.map((item, i) => (
          <ContextMenuItem
            key={i}
            onClick={() => item.action(groupId)}
            className="gap-2 text-ui-base cursor-pointer"
          >
            <item.icon className={item.iconClassName || "w-3.5 h-3.5 shrink-0"} />
            <span>{item.label}</span>
          </ContextMenuItem>
        ))}
      </>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full w-full overflow-hidden',
        isFocused && 'ring-1 ring-inset ring-blue-500/30'
      )}
      onClick={handleContentClick}
    >
      {/* Tab bar */}
      <div
        className="no-drag flex items-end bg-zinc-900/80 border-b border-zinc-700/50 shrink-0 relative"
        style={{ height: 36 }}
      >
        <div
          ref={tabBarRef}
          className="flex items-end flex-1 min-w-0 overflow-x-auto scrollbar-hide"
          // Empty tab bar area is also a drop zone for appending tabs to the end
          onDragOver={e => handleTabDragOver(e, group.tabs.length)}
          onDragLeave={() => setDragOverTabIndex(null)}
          onDrop={e => handleTabDrop(e, group.tabs.length)}
        >
        <div className="flex items-end min-w-0">
          <TooltipProvider delayDuration={600} skipDelayDuration={200}>
          {group.tabs.map((tab, index) => (
            <ContextMenu key={tab.id}>
              <Tooltip>
              <ContextMenuTrigger asChild>
              <TooltipTrigger asChild>
              <div
                draggable
                // Explicitly enable drag across the entire tab surface in Electron/Chromium,
                // where user-select:none can limit drag initiation to text nodes only.
                style={{ WebkitUserDrag: 'element' } as React.CSSProperties}
                onDragStart={e => handleTabDragStart(e, tab, index)}
                onDragEnd={handleTabDragEnd}
                onDragOver={e => handleTabDragOver(e, index)}
                onDragLeave={() => setDragOverTabIndex(null)}
                onDrop={e => handleTabDrop(e, index)}
                onClick={(e) => {
                  setFocusedGroup(groupId)
                  if (e.shiftKey) {
                    // Shift-click: select range from anchor to this tab
                    e.preventDefault()
                    useTabsStore.getState().selectTabRange(groupId, tab.id)
                    return
                  }
                  if (e.metaKey || e.ctrlKey) {
                    // Cmd/Ctrl-click: toggle this tab in selection
                    e.preventDefault()
                    useTabsStore.getState().toggleSelectTab(groupId, tab.id)
                    return
                  }
                  // Plain click: clear selection, activate tab
                  useTabsStore.getState().clearSelection(groupId)
                  setActiveTab(groupId, tab.id)
                  // Set anchor for future shift-clicks
                  useTabsStore.setState(s => ({
                    selectionAnchor: { ...s.selectionAnchor, [groupId]: tab.id },
                  }))
                  // Clear notification badge when tab is focused
                  const badges = useNotificationsStore.getState().tabBadges
                  if (badges[tab.id]) {
                    useNotificationsStore.setState(s => {
                      const next = { ...s.tabBadges }
                      delete next[tab.id]
                      return { tabBadges: next }
                    })
                  }
                }}
                className={cn(
                  'flex items-center gap-1.5 px-3 h-8 cursor-pointer select-none border-r border-zinc-700/40 shrink-0 max-w-[180px] group/tab',
                  tab.id === group.activeTabId
                    // Only the focused pane's active tab gets the blue highlight
                    ? isFocused
                      ? 'bg-zinc-950 text-zinc-50 border-t-2 border-t-blue-400'
                      : 'bg-zinc-900/80 text-zinc-400'
                    : 'bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200',
                  dragOverTabIndex === index && 'border-l-2 border-l-blue-400',
                  tab.id === group.activeTabId && tab.isThinking && 'tab-thinking-bar',
                  // Multi-select highlight (non-active selected tabs get a subtle blue tint)
                  selectedTabIds?.has(tab.id) && tab.id !== group.activeTabId && 'bg-blue-900/30 text-zinc-200'
                )}
              >
                <TabIcon type={tab.type} />
                {renamingTabId === tab.id ? (
                  <input
                    ref={renameInputRef}
                    className="text-ui-base flex-1 min-w-0 bg-transparent border border-zinc-600 rounded px-1 outline-none text-zinc-100"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setRenamingTabId(null)
                      e.stopPropagation()
                    }}
                    onBlur={commitRename}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="text-ui-base truncate flex-1"
                    onDoubleClick={e => { e.stopPropagation(); startRename(tab) }}
                  >
                    {tab.title}{tab.isDirty ? '*' : ''}
                  </span>
                )}
                {tab.note && (
                  <StickyNote className="w-3 h-3 shrink-0 text-amber-400/80" aria-label="Has note" />
                )}
                <TabBadge tabId={tab.id} />
                <Button
                  variant="ghost"
                  size="icon"
                  draggable={false}
                  onClick={e => handleCloseTab(e, tab.id)}
                  className={cn(
                    'shrink-0 w-4 h-4 opacity-0 group-hover/tab:opacity-100 hover:bg-zinc-700 transition-all',
                    tab.id === group.activeTabId && 'opacity-60'
                  )}
                >
                  <X className="w-2.5 h-2.5" />
                </Button>
              </div>
              </TooltipTrigger>
              </ContextMenuTrigger>
              {tab.note && (
                <TooltipContent
                  side="bottom"
                  align="start"
                  className="max-w-[320px] whitespace-pre-wrap break-words bg-zinc-900 border-zinc-700 text-zinc-200 px-2.5 py-1.5 text-ui-xs"
                >
                  {tab.note}
                </TooltipContent>
              )}
              </Tooltip>
              <ContextMenuContent className="w-44 bg-zinc-900 border-zinc-700">
                {(() => {
                  const sel = getEffectiveSelection(tab.id)
                  const multiSelected = sel.length > 1
                  if (multiSelected) {
                    // Multi-select context menu
                    const hasTerminalLike = sel.some(id => {
                      const t = group.tabs.find(t => t.id === id)
                      return t && isTerminalLike(t.type)
                    })
                    return (
                      <>
                        <ContextMenuLabel className="text-ui-xs text-zinc-500 font-normal py-0.5">
                          {sel.length} tabs selected
                        </ContextMenuLabel>
                        <CtxMenuSeparator className="bg-zinc-700" />
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="gap-2 text-ui-base cursor-pointer">
                            <LayoutGrid className="w-3.5 h-3.5" />
                            Tile Selected
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="bg-zinc-900 border-zinc-700">
                            <ContextMenuItem
                              className="gap-2 text-ui-base cursor-pointer"
                              onClick={() => tileSelectedTabs(tab.id, 'columns')}
                            >
                              <Columns3 className="w-3.5 h-3.5" />
                              Columns
                            </ContextMenuItem>
                            <ContextMenuItem
                              className="gap-2 text-ui-base cursor-pointer"
                              onClick={() => tileSelectedTabs(tab.id, 'rows')}
                            >
                              <Rows3 className="w-3.5 h-3.5" />
                              Rows
                            </ContextMenuItem>
                            <ContextMenuItem
                              className="gap-2 text-ui-base cursor-pointer"
                              onClick={() => tileSelectedTabs(tab.id, 'grid')}
                            >
                              <LayoutGrid className="w-3.5 h-3.5" />
                              Grid
                            </ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <CtxMenuSeparator className="bg-zinc-700" />
                        <ContextMenuItem
                          className="gap-2 text-ui-base cursor-pointer"
                          onClick={() => closeSelectedTabs(tab.id)}
                        >
                          <X className="w-3.5 h-3.5" />
                          Close Selected
                        </ContextMenuItem>
                        {hasTerminalLike && (
                          <ContextMenuItem
                            className="gap-2 text-ui-base cursor-pointer text-red-400 focus:text-red-300"
                            onClick={() => killSelectedTabs(tab.id)}
                          >
                            <Skull className="w-3.5 h-3.5" />
                            Kill Selected
                          </ContextMenuItem>
                        )}
                      </>
                    )
                  }
                  // Single-tab context menu (original)
                  return (
                    <>
                      <ContextMenuItem
                        className="gap-2 text-ui-base cursor-pointer"
                        onClick={() => startRename(tab)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Rename
                      </ContextMenuItem>
                      <ContextMenuItem
                        className="gap-2 text-ui-base cursor-pointer"
                        onClick={() => startEditNote(tab)}
                      >
                        <StickyNote className="w-3.5 h-3.5" />
                        {tab.note ? 'Edit Tab Note' : 'Add Tab Note'}
                      </ContextMenuItem>
                      {tab.type === 'claude-code' && claudeAccounts.length > 0 && (
                        <>
                          <CtxMenuSeparator className="bg-zinc-700" />
                          <ContextMenuSub>
                            <ContextMenuSubTrigger className="gap-2 text-ui-base cursor-pointer">
                              <UserCircle className="w-3.5 h-3.5" />
                              Switch Account
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="bg-zinc-900 border-zinc-700">
                              <ContextMenuLabel className="text-ui-xs text-zinc-500 font-normal py-0.5">Restart with account</ContextMenuLabel>
                              <CtxMenuSeparator className="bg-zinc-700" />
                              <ContextMenuItem
                                className="gap-2 text-ui-base cursor-pointer"
                                onClick={() => {
                                  killTerminal(tab.id)
                                  useTabsStore.getState().updateTab(groupId, tab.id, {
                                    apiKey: undefined,
                                    initialCommand: 'claude\n',
                                    refreshKey: (tab.refreshKey || 0) + 1,
                                  })
                                }}
                              >
                                {!tab.apiKey && <Check className="w-3.5 h-3.5 text-blue-400" />}
                                {tab.apiKey && <span className="w-3.5" />}
                                Default
                              </ContextMenuItem>
                              <CtxMenuSeparator className="bg-zinc-700" />
                              {claudeAccounts.map(account => (
                                <ContextMenuItem
                                  key={account.id}
                                  className="gap-2 text-ui-base cursor-pointer"
                                  onClick={() => {
                                    killTerminal(tab.id)
                                    useTabsStore.getState().updateTab(groupId, tab.id, {
                                      apiKey: account.apiKey,
                                      initialCommand: 'claude\n',
                                      refreshKey: (tab.refreshKey || 0) + 1,
                                    })
                                  }}
                                >
                                  {tab.apiKey === account.apiKey && <Check className="w-3.5 h-3.5 text-blue-400" />}
                                  {tab.apiKey !== account.apiKey && <span className="w-3.5" />}
                                  {account.name}
                                </ContextMenuItem>
                              ))}
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                        </>
                      )}
                      {isTerminalLike(tab.type) && (
                        <>
                          <CtxMenuSeparator className="bg-zinc-700" />
                          <ContextMenuItem
                            className="gap-2 text-ui-base cursor-pointer"
                            onClick={() => refreshTab(tab)}
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            Refresh
                          </ContextMenuItem>
                        </>
                      )}
                      <CtxMenuSeparator className="bg-zinc-700" />
                      <ContextMenuItem
                        className="gap-2 text-ui-base cursor-pointer"
                        onClick={() => closeTab(tab.id)}
                      >
                        <X className="w-3.5 h-3.5" />
                        Close
                      </ContextMenuItem>
                      {isTerminalLike(tab.type) && (
                        <ContextMenuItem
                          className="gap-2 text-ui-base cursor-pointer text-red-400 focus:text-red-300"
                          onClick={() => killAndCloseTab(tab.id)}
                        >
                          <Skull className="w-3.5 h-3.5" />
                          Kill Session
                        </ContextMenuItem>
                      )}
                    </>
                  )
                })()}
              </ContextMenuContent>
            </ContextMenu>
          ))}
          </TooltipProvider>

          {/* New tab button doubles as drop zone for dragging tabs to the end */}
          <DropdownMenu open={newTabMenuOpen} onOpenChange={setNewTabMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'w-8 h-8 shrink-0 rounded-none text-zinc-500 hover:text-zinc-200',
                  dragOverTabIndex === group.tabs.length && 'border-l-2 border-l-blue-400'
                )}
                onDragOver={e => handleTabDragOver(e, group.tabs.length)}
                onDragLeave={() => setDragOverTabIndex(null)}
                onDrop={e => handleTabDrop(e, group.tabs.length)}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44 bg-zinc-900 border-zinc-700 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
              {renderMenuItems(() => setNewTabMenuOpen(false))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        </div>

        {/* Close pane button — only visible when the pane is empty and not the last group */}
        {group.tabs.length === 0 && getAllGroupIds().length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 shrink-0 rounded-none text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            onClick={() => {
              removeGroup(groupId)
              useTabsStore.getState().removeGroup(groupId)
            }}
            title="Close Pane"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Floating new tab menu (Cmd+T at mouse position) */}
      <DropdownMenu open={floatingMenuOpen} onOpenChange={(open) => { setFloatingMenuOpen(open); if (!open) setFloatingSubmenu(null) }}>
        <DropdownMenuTrigger asChild>
          <div
            ref={floatingAnchorRef}
            style={{
              position: 'fixed',
              left: floatingMenuPos.x,
              top: floatingMenuPos.y,
              width: 0,
              height: 0,
              pointerEvents: 'none',
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44 bg-zinc-900 border-zinc-700 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          {floatingSubmenu === 'claude' ? (
            <>
              <DropdownMenuLabel className="text-ui-xs text-zinc-500 font-normal py-0.5">Claude Accounts</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { addClaudeTab(); setFloatingMenuOpen(false) }} className="gap-2 text-ui-base cursor-pointer">
                Default
                <NumberHint n={1} />
              </DropdownMenuItem>
              {claudeAccounts.length > 0 && <DropdownMenuSeparator />}
              {claudeAccounts.map((account, i) => (
                <DropdownMenuItem key={account.id} onClick={() => { addClaudeTab(account.apiKey, account.name); setFloatingMenuOpen(false) }} className="gap-2 text-ui-base cursor-pointer">
                  {account.name}
                  <NumberHint n={i + 2} />
                </DropdownMenuItem>
              ))}
            </>
          ) : floatingSubmenu === 'browser' ? (
            <>
              <DropdownMenuLabel className="text-ui-xs text-zinc-500 font-normal py-0.5">Browser</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { useTabsStore.getState().addTab(groupId, { type: 'browser', title: 'Browser', url: 'https://google.com' }); setFloatingMenuOpen(false) }} className="gap-2 text-ui-base cursor-pointer">
                Internal
                <NumberHint n={1} />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { window.electronAPI.openExternal('https://google.com'); setFloatingMenuOpen(false) }} className="gap-2 text-ui-base cursor-pointer">
                System
                <NumberHint n={2} />
              </DropdownMenuItem>
            </>
          ) : (
            renderMenuItems(() => setFloatingMenuOpen(false), true)
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Tab content */}
      <div
        ref={contentRef}
        className="flex-1 min-h-0 min-w-0 relative overflow-hidden bg-zinc-950"
        onDragOver={handleContentDragOver}
        onDragLeave={handleContentDragLeave}
        onDrop={handleContentDrop}
      >
        {group.tabs.length === 0 ? (
          <EmptyState groupId={groupId} renderContextMenuItems={renderContextMenuItems} />
        ) : (
          group.tabs.map(tab => {
            const Component = extensionRegistry.getTabComponent(tab.type)
            if (!Component) return null
            return (
              <div
                key={`${tab.id}-${tab.refreshKey || 0}`}
                className={cn('absolute inset-0', tab.id !== group.activeTabId ? 'invisible pointer-events-none' : 'z-10')}
              >
                <Component
                  tabId={tab.id}
                  groupId={groupId}
                  isActive={tab.id === group.activeTabId}
                  tab={tab}
                />
              </div>
            )
          })
        )}

        {/* Drag capture overlay — covers canvas/webview children that eat drag events */}
        {isDraggingTab && (
          <div
            className="absolute inset-0 z-10"
            onDragOver={handleContentDragOver}
            onDragLeave={handleContentDragLeave}
            onDrop={handleContentDrop}
          />
        )}

        {/* Drop zone overlay */}
        {dropZone && (
          <div className="absolute inset-0 pointer-events-none z-20">
            <div
              className={cn(
                'absolute bg-blue-500/20 border-2 border-blue-500 transition-all',
                dropZone === 'west' && 'top-0 left-0 bottom-0 w-1/2',
                dropZone === 'east' && 'top-0 right-0 bottom-0 w-1/2',
                dropZone === 'north' && 'top-0 left-0 right-0 h-1/2',
                dropZone === 'south' && 'bottom-0 left-0 right-0 h-1/2'
              )}
            />
          </div>
        )}

      </div>

      {/* Tab note editor dialog */}
      <Dialog open={noteEditTabId !== null} onOpenChange={(open) => { if (!open) cancelEditNote() }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle>Tab Note</DialogTitle>
          </DialogHeader>
          <textarea
            autoFocus
            value={noteEditValue}
            onChange={(e) => setNoteEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                commitNote()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                cancelEditNote()
              }
            }}
            placeholder="Add a note for this tab. Hover the tab to see it."
            rows={6}
            className="w-full resize-y rounded bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-ui-base text-zinc-100 outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-500"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={cancelEditNote}>Cancel</Button>
            <Button onClick={commitNote}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
