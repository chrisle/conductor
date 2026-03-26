import React, { useState, useRef, useEffect } from 'react'
import { X, Plus, FileText, FolderOpen, FilePlus2, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useTabsStore, type Tab } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import { extensionRegistry } from '@/extensions'
import { openProjectDialog, createNewProject } from '@/lib/project-io'

interface TabGroupProps {
  groupId: string
}

type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center' | null

const DRAGGING_TAB_KEY = '__dragging_tab__'
const DRAGGING_GROUP_KEY = '__dragging_group__'

function EmptyState({ onContextMenu }: { onContextMenu: (e: React.MouseEvent) => void }) {
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
      <div
        className="flex flex-col items-center justify-center h-full gap-6"
        onContextMenu={onContextMenu}
      >
        <div className="text-2xl font-light text-zinc-400 tracking-wide">Conductor</div>
        <div className="flex gap-4">
          <button
            onClick={() => openProjectDialog()}
            className="flex flex-col items-center gap-3 w-40 py-6 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 hover:border-zinc-700 transition-colors group"
          >
            <FolderOpen className="w-8 h-8 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            <span className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">Open Project</span>
          </button>
          <button
            onClick={openDialog}
            className="flex flex-col items-center gap-3 w-40 py-6 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 hover:border-zinc-700 transition-colors group"
          >
            <FilePlus2 className="w-8 h-8 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            <span className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">New Project</span>
          </button>
        </div>
        <div className="flex flex-col gap-1.5 text-xs text-zinc-600 mt-2">
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-500 font-mono text-[10px]">⌘T</kbd>
            <span>New terminal</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-500 font-mono text-[10px]">⌘W</kbd>
            <span>Close tab</span>
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm" hideClose>
          <VisuallyHidden><DialogTitle>New Project</DialogTitle></VisuallyHidden>
          <div className="space-y-4">
            <div className="text-sm text-zinc-300 font-medium">New Project</div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Name</label>
              <input ref={inputRef}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-500 placeholder-zinc-500"
                placeholder="my-project" value={projectName}
                onChange={e => { setProjectName(e.target.value); setError('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setDialogOpen(false) }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Directory</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-400 truncate min-w-0">
                  {directory ? friendly(directory) : 'Select a directory...'}
                </div>
                <Button variant="ghost" className="shrink-0 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700" onClick={handleBrowse}>
                  <Folder className="w-3.5 h-3.5 mr-1.5" />
                  Browse
                </Button>
              </div>
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
            {projectName.trim() && directory && (
              <div className="text-[11px] text-zinc-500">
                Creates <span className="text-zinc-300">{friendly(directory)}/{projectName.trim()}.conductor</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200" onClick={handleCreate}>Create</Button>
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

export default function TabGroup({ groupId }: TabGroupProps): React.ReactElement {
  const { groups, setActiveTab, removeTab, addTab, moveTab } = useTabsStore()
  const { focusedGroupId, setFocusedGroup, splitGroup, removeGroup, getAllGroupIds } = useLayoutStore()
  const group = groups[groupId]

  const [dropZone, setDropZone] = useState<DropZone>(null)
  const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null)
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false)
  const [cursorMenuOpen, setCursorMenuOpen] = useState(false)
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const tabBarRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dragIndexRef = useRef<number | null>(null)
  const { rootPath } = useSidebarStore()
  const isFocused = focusedGroupId === groupId

  // Track mouse position within this group
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const onMove = (e: MouseEvent) => setCursorPos({ x: e.clientX, y: e.clientY })
    el.addEventListener('mousemove', onMove)
    return () => el.removeEventListener('mousemove', onMove)
  }, [])

  // Cmd+T opens terminal
  useEffect(() => {
    if (!isFocused) return
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        const cwd = useSidebarStore.getState().rootPath || undefined
        addTab(groupId, { type: 'terminal', title: 'Terminal', filePath: cwd })
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isFocused])

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
    const edge = 80

    let zone: DropZone = 'center'
    if (x < edge) zone = 'left'
    else if (x > w - edge) zone = 'right'
    else if (y < edge) zone = 'top'
    else if (y > h - edge) zone = 'bottom'

    setDropZone(zone)
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

    if (zone === 'center') {
      if (sourceGroupId !== groupId) {
        moveTab(sourceGroupId, tabId, groupId)
      }
      return
    }

    const newGroupId = useTabsStore.getState().createGroup()
    const direction = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical'
    splitGroup(groupId, direction, newGroupId)
    moveTab(sourceGroupId, tabId, newGroupId)

    setTimeout(() => {
      const src = useTabsStore.getState().groups[sourceGroupId]
      if (src && src.tabs.length === 0 && sourceGroupId !== groupId) {
        removeGroup(sourceGroupId)
        useTabsStore.getState().removeGroup(sourceGroupId)
      }
    }, 0)
  }

  useEffect(() => {
    if (!isFocused) return
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault()
        if (group.activeTabId) closeTab(group.activeTabId)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isFocused, group.activeTabId])

  function closeTab(tabId: string) {
    const tab = group.tabs.find(t => t.id === tabId)
    if (tab && (tab.type === 'terminal' || tab.type === 'claude')) {
      window.electronAPI.killTerminal(tabId)
    }
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

  function handleCloseTab(e: React.MouseEvent, tabId: string) {
    e.stopPropagation()
    closeTab(tabId)
  }

  function handleContentClick() {
    setFocusedGroup(groupId)
  }

  // Get menu items from plugin registry
  const menuItems = extensionRegistry.getNewTabMenuItems()

  function renderMenuItems(onDone: () => void) {
    return menuItems.map((item, i) => (
      <React.Fragment key={i}>
        {item.separator === 'before' && <DropdownMenuSeparator />}
        <DropdownMenuItem
          onClick={() => { item.action(groupId); onDone() }}
          className="gap-2 text-xs cursor-pointer"
        >
          <item.icon className={item.iconClassName || "w-3.5 h-3.5 shrink-0"} />
          <span>{item.label}</span>
        </DropdownMenuItem>
        {item.separator === 'after' && <DropdownMenuSeparator />}
      </React.Fragment>
    ))
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
        className="flex items-end bg-zinc-900 border-b border-zinc-800 shrink-0 relative"
        style={{ height: 36 }}
      >
        <div
          ref={tabBarRef}
          className="flex items-end flex-1 min-w-0 overflow-x-auto"
          onDragOver={e => { e.preventDefault() }}
        >
        <div className="flex items-end min-w-0">
          {group.tabs.map((tab, index) => (
            <div
              key={tab.id}
              draggable
              onDragStart={e => handleTabDragStart(e, tab, index)}
              onDragOver={e => handleTabDragOver(e, index)}
              onDragLeave={() => setDragOverTabIndex(null)}
              onDrop={e => handleTabDrop(e, index)}
              onClick={() => {
                setActiveTab(groupId, tab.id)
                setFocusedGroup(groupId)
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 h-8 cursor-pointer select-none border-r border-zinc-800 shrink-0 max-w-[180px] group/tab transition-colors',
                tab.id === group.activeTabId
                  ? 'bg-zinc-950 text-zinc-100 border-b-2 border-b-blue-500'
                  : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300',
                dragOverTabIndex === index && 'border-l-2 border-l-blue-500',
                tab.id === group.activeTabId && tab.isThinking && 'tab-thinking-bar'
              )}
            >
              <TabIcon type={tab.type} />
              <span className="text-xs truncate flex-1">
                {tab.isDirty ? '● ' : ''}{tab.title}
              </span>
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
          ))}

          {/* New tab dropdown */}
          <DropdownMenu open={newTabMenuOpen} onOpenChange={setNewTabMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0 rounded-none text-zinc-600 hover:text-zinc-300">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44 bg-zinc-900 border-zinc-700">
              {renderMenuItems(() => setNewTabMenuOpen(false))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        </div>
      </div>

      {/* Tab content */}
      <div
        ref={contentRef}
        className="flex-1 min-h-0 min-w-0 relative overflow-hidden bg-zinc-950"
        onDragOver={handleContentDragOver}
        onDragLeave={handleContentDragLeave}
        onDrop={handleContentDrop}
      >
        {group.tabs.length === 0 ? (
          <EmptyState
            onContextMenu={(e) => {
              e.preventDefault()
              setCursorPos({ x: e.clientX, y: e.clientY })
              setCursorMenuOpen(true)
            }}
          />
        ) : (
          group.tabs.map(tab => {
            const Component = extensionRegistry.getTabComponent(tab.type)
            if (!Component) return null
            return (
              <div
                key={tab.id}
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
        {dropZone && dropZone !== 'center' && (
          <div className="absolute inset-0 pointer-events-none z-10">
            <div
              className={cn(
                'absolute bg-blue-500/20 border-2 border-blue-500 transition-all',
                dropZone === 'left' && 'top-0 left-0 bottom-0 w-1/2',
                dropZone === 'right' && 'top-0 right-0 bottom-0 w-1/2',
                dropZone === 'top' && 'top-0 left-0 right-0 h-1/2',
                dropZone === 'bottom' && 'bottom-0 left-0 right-0 h-1/2'
              )}
            />
          </div>
        )}
        {dropZone === 'center' && (
          <div className="absolute inset-0 pointer-events-none z-10 bg-blue-500/10 border-2 border-blue-500" />
        )}

        {/* Context menu */}
        {cursorMenuOpen && (
          <DropdownMenu open onOpenChange={setCursorMenuOpen}>
            <DropdownMenuTrigger asChild>
              <div className="fixed" style={{ top: cursorPos.y, left: cursorPos.x, width: 1, height: 1 }} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44 bg-zinc-900 border-zinc-700">
              {renderMenuItems(() => setCursorMenuOpen(false))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
