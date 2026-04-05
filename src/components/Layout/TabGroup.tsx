import React, { useState, useRef, useEffect } from 'react'
import { X, Plus, FileText, FolderOpen, FilePlus2, Folder, RotateCw, Pencil, Skull } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator as CtxMenuSeparator, ContextMenuTrigger, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuLabel } from '@/components/ui/context-menu'
import { useTabsStore, type Tab } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import { extensionRegistry } from '@/extensions'
import { openProjectDialog, openProject, createNewProject } from '@/lib/project-io'
import { useProjectStore } from '@/store/project'
import { useConfigStore } from '@/store/config'
import { useSettingsDialogStore } from '@/store/settingsDialog'
import { killTerminal } from '@/lib/terminal-api'
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
  const [dialogOpen, setDialogOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [directory, setDirectory] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function openDialog() {
    setProjectName('')
    setDirectory('')
    setError('')
    setDialogOpen(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function handleBrowse() {
    const dir = await window.electronAPI.selectDirectory()
    if (dir) setDirectory(dir)
  }

  async function handleCreate() {
    const trimmed = projectName.trim()
    if (!trimmed) { setError('Name is required'); return }
    if (/[/\\:*?"<>|]/.test(trimmed)) { setError('Invalid characters in name'); return }
    if (!directory) { setError('Select a directory'); return }

    const success = await createNewProject(trimmed, directory)
    if (!success) { setError('Failed to create project'); return }
    setDialogOpen(false)
  }

  const friendly = (p: string) => p.replace(/^\/Users\/[^/]+/, '~')

  return (
    <>
      <ContextMenu>
      <ContextMenuTrigger asChild>
      <div
        className="flex flex-col items-center justify-center h-full gap-6"
      >
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
            onClick={openDialog}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm" hideClose>
          <VisuallyHidden><DialogTitle>New Project</DialogTitle></VisuallyHidden>
          <div className="space-y-4">
            <div className="text-ui-base text-zinc-300 font-medium">New Project</div>
            <div className="space-y-1.5">
              <label className="text-ui-sm text-zinc-500 uppercase tracking-wider">Name</label>
              <input ref={inputRef}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-ui-base text-zinc-200 outline-none focus:border-zinc-500 placeholder-zinc-500"
                placeholder="my-project" value={projectName}
                onChange={e => { setProjectName(e.target.value); setError('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setDialogOpen(false) }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-ui-sm text-zinc-500 uppercase tracking-wider">Directory</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-ui-base text-zinc-400 truncate min-w-0">
                  {directory ? friendly(directory) : 'Select a directory...'}
                </div>
                <Button variant="ghost" className="shrink-0 text-ui-base text-zinc-400 hover:text-zinc-200 border border-zinc-700" onClick={handleBrowse}>
                  <Folder className="w-3.5 h-3.5 mr-1.5" />
                  Browse
                </Button>
              </div>
            </div>
            {error && <div className="text-ui-base text-red-400">{error}</div>}
            {projectName.trim() && directory && (
              <div className="text-ui-sm text-zinc-500">
                Creates <span className="text-zinc-300">{friendly(directory)}/{projectName.trim()}.conductor</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-ui-base text-zinc-400 hover:text-zinc-200" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="text-ui-base bg-zinc-700 hover:bg-zinc-600 text-zinc-200" onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
  const { focusedGroupId, setFocusedGroup, insertPanel, removeGroup, getAllGroupIds } = useLayoutStore()
  const group = groups[groupId]

  const [dropZone, setDropZone] = useState<DropZone>(null)
  const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null)
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false)
  const [floatingMenuOpen, setFloatingMenuOpen] = useState(false)
  const [floatingMenuPos, setFloatingMenuPos] = useState({ x: 0, y: 0 })
  const [floatingSubmenu, setFloatingSubmenu] = useState<'claude' | 'browser' | null>(null)
  const floatingAnchorRef = useRef<HTMLDivElement>(null)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dragIndexRef = useRef<number | null>(null)
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

  // Cmd+W closes active tab
  useEffect(() => {
    if (!isFocused || !group) return
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault()
        if (group.activeTabId) closeTab(group.activeTabId)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isFocused, group?.activeTabId])

  const claudeAccounts = useConfigStore(s => s.config.claudeAccounts)

  function addClaudeTab(apiKey?: string, accountName?: string) {
    const cwd = rootPath || undefined
    const id = nextSessionId('claude-code')
    useTabsStore.getState().addTab(groupId, {
      id,
      type: 'claude-code',
      title: accountName ? `${id} (${accountName})` : id,
      filePath: cwd,
      initialCommand: 'claude\n',
      apiKey,
    })
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
        const cwd = rootPath || undefined
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

  if (!group) return <div className="h-full w-full bg-zinc-950" />

  const activeTab = group.tabs.find(t => t.id === group.activeTabId)

  // --- Tab bar drag (reorder within group or move between groups) ---
  function handleTabDragStart(e: React.DragEvent, tab: Tab, index: number) {
    dragIndexRef.current = index
    e.dataTransfer.setData(DRAGGING_TAB_KEY, tab.id)
    e.dataTransfer.setData(DRAGGING_GROUP_KEY, groupId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleTabDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverTabIndex(index)
  }

  function handleTabDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault()
    e.stopPropagation()
    const tabId = e.dataTransfer.getData(DRAGGING_TAB_KEY)
    const sourceGroupId = e.dataTransfer.getData(DRAGGING_GROUP_KEY)
    setDragOverTabIndex(null)

    if (!tabId) return

    if (sourceGroupId === groupId) {
      const sourceIndex = group.tabs.findIndex(t => t.id === tabId)
      if (sourceIndex !== -1 && sourceIndex !== targetIndex) {
        useTabsStore.getState().reorderTab(groupId, sourceIndex, targetIndex)
      }
    } else {
      moveTab(sourceGroupId, tabId, groupId, targetIndex)
    }
  }

  // --- Content area drop (split screen) ---
  function handleContentDragOver(e: React.DragEvent) {
    e.preventDefault()
    const rect = contentRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const w = rect.width
    const h = rect.height

    // Determine zone by which edge is closest
    const distances = {
      west: x,
      east: w - x,
      north: y,
      south: h - y,
    }
    const closest = (Object.keys(distances) as DropZone[]).reduce((a, b) =>
      a && b && distances[a as keyof typeof distances] < distances[b as keyof typeof distances] ? a : b
    )

    setDropZone(closest)
    e.dataTransfer.dropEffect = 'move'
  }

  function handleContentDragLeave(e: React.DragEvent) {
    if (!contentRef.current?.contains(e.relatedTarget as Node)) {
      setDropZone(null)
    }
  }

  function handleContentDrop(e: React.DragEvent) {
    e.preventDefault()
    const tabId = e.dataTransfer.getData(DRAGGING_TAB_KEY)
    const sourceGroupId = e.dataTransfer.getData(DRAGGING_GROUP_KEY)
    const zone = dropZone
    setDropZone(null)

    if (!tabId || !zone) return

    const newGroupId = useTabsStore.getState().createGroup()
    insertPanel(groupId, zone, newGroupId)
    moveTab(sourceGroupId, tabId, newGroupId)

    setTimeout(() => {
      const src = useTabsStore.getState().groups[sourceGroupId]
      if (src && src.tabs.length === 0 && sourceGroupId !== groupId) {
        removeGroup(sourceGroupId)
        useTabsStore.getState().removeGroup(sourceGroupId)
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

  const friendly = (p: string) => p.replace(/^\/Users\/[^/]+/, '~')

  function NumberHint({ n }: { n: number }) {
    return (
      <span className="text-[10px] text-zinc-500 font-mono leading-none order-first">{n}</span>
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
            const cwd = rootPath || undefined
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
            const cwd = rootPath || undefined
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
        className="flex items-end bg-zinc-900/80 border-b border-zinc-700/50 shrink-0 relative"
        style={{ height: 36 }}
      >
        <div
          ref={tabBarRef}
          className="flex items-end flex-1 min-w-0 overflow-x-auto"
          onDragOver={e => { e.preventDefault() }}
        >
        <div className="flex items-end min-w-0">
          {group.tabs.map((tab, index) => (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
              <div
                draggable
                onDragStart={e => handleTabDragStart(e, tab, index)}
                onDragOver={e => handleTabDragOver(e, index)}
                onDragLeave={() => setDragOverTabIndex(null)}
                onDrop={e => handleTabDrop(e, index)}
                onClick={() => {
                  setActiveTab(groupId, tab.id)
                  setFocusedGroup(groupId)
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
                  'flex items-center gap-1.5 px-3 h-8 cursor-pointer select-none border-r border-zinc-700/40 shrink-0 max-w-[180px] group/tab transition-colors',
                  tab.id === group.activeTabId
                    ? 'bg-zinc-950 text-zinc-50 border-b-2 border-b-blue-400'
                    : 'bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200',
                  dragOverTabIndex === index && 'border-l-2 border-l-blue-400',
                  tab.id === group.activeTabId && tab.isThinking && 'tab-thinking-bar'
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
                <TabBadge tabId={tab.id} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={e => handleCloseTab(e, tab.id)}
                  className={cn(
                    'shrink-0 w-4 h-4 opacity-0 group-hover/tab:opacity-100 hover:bg-zinc-700 transition-all',
                    tab.id === group.activeTabId && 'opacity-60'
                  )}
                >
                  <X className="w-2.5 h-2.5" />
                </Button>
              </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-44 bg-zinc-900 border-zinc-700">
                <ContextMenuItem
                  className="gap-2 text-ui-base cursor-pointer"
                  onClick={() => startRename(tab)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Rename
                </ContextMenuItem>
                {isTerminalLike(tab.type) && (
                  <>
                    <CtxMenuSeparator />
                    <ContextMenuItem
                      className="gap-2 text-ui-base cursor-pointer"
                      onClick={() => refreshTab(tab)}
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      Refresh
                    </ContextMenuItem>
                  </>
                )}
                <CtxMenuSeparator />
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
              </ContextMenuContent>
            </ContextMenu>
          ))}

          {/* New tab dropdown */}
          <DropdownMenu open={newTabMenuOpen} onOpenChange={setNewTabMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0 rounded-none text-zinc-500 hover:text-zinc-200">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44 bg-zinc-900 border-zinc-700 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
              {renderMenuItems(() => setNewTabMenuOpen(false))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        </div>
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
                className={cn('absolute inset-0', tab.id !== group.activeTabId && 'hidden')}
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

        {/* Drop zone overlay */}
        {dropZone && (
          <div className="absolute inset-0 pointer-events-none z-10">
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
    </div>
  )
}
