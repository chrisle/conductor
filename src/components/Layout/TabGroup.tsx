import React, { useState, useRef, useEffect } from 'react'
import { X, Plus, Terminal, Globe, FileText } from 'lucide-react'
import ClaudeIcon from '../ui/ClaudeIcon'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useTabsStore, type Tab } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import TextTab from '../tabs/TextTab'
import BrowserTab from '../tabs/BrowserTab'
import TerminalTab from '../tabs/TerminalTab'
import ClaudeTab from '../tabs/ClaudeTab'

interface TabGroupProps {
  groupId: string
}

type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center' | null

const DRAGGING_TAB_KEY = '__dragging_tab__'
const DRAGGING_GROUP_KEY = '__dragging_group__'

function TabIcon({ type }: { type: Tab['type'] }) {
  if (type === 'terminal') return <Terminal className="w-3 h-3" />
  if (type === 'browser') return <Globe className="w-3 h-3" />
  if (type === 'claude') return <ClaudeIcon className="w-5 h-5 text-[#D97757] -mr-1" />
  return <FileText className="w-3 h-3" />
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

  // Cmd+T opens menu at cursor
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
      // Reorder within group
      const sourceIndex = group.tabs.findIndex(t => t.id === tabId)
      if (sourceIndex !== -1 && sourceIndex !== targetIndex) {
        useTabsStore.getState().reorderTab(groupId, sourceIndex, targetIndex)
      }
    } else {
      // Move from another group
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

    // Create new group for split
    const newGroupId = useTabsStore.getState().createGroup()
    const direction = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical'

    // Split this group
    splitGroup(groupId, direction, newGroupId)

    // Move tab to new group
    moveTab(sourceGroupId, tabId, newGroupId)

    // Cleanup source group if empty
    setTimeout(() => {
      const src = useTabsStore.getState().groups[sourceGroupId]
      if (src && src.tabs.length === 0 && sourceGroupId !== groupId) {
        removeGroup(sourceGroupId)
        useTabsStore.getState().removeGroup(sourceGroupId)
      }
    }, 0)
  }

  function openTerminal() {
    const cwd = rootPath || undefined
    addTab(groupId, { type: 'terminal', title: 'Terminal', filePath: cwd })
    setNewTabMenuOpen(false)
  }

  function openBrowser() {
    addTab(groupId, { type: 'browser', title: 'Browser', url: 'https://google.com' })
    setNewTabMenuOpen(false)
  }

  function openClaude() {
    addTab(groupId, { type: 'claude', title: 'Claude', filePath: rootPath || undefined })
    setNewTabMenuOpen(false)
    setCursorMenuOpen(false)
  }

  function openClaudeContinue() {
    addTab(groupId, { type: 'claude', title: 'Claude', filePath: rootPath || undefined, initialCommand: "claude --continue\n" })
    setNewTabMenuOpen(false)
    setCursorMenuOpen(false)
  }

  function openClaudeResume() {
    addTab(groupId, { type: 'claude', title: 'Claude', filePath: rootPath || undefined, initialCommand: "claude --resume\n" })
    setNewTabMenuOpen(false)
    setCursorMenuOpen(false)
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
    // Kill terminal PTY when tab is actually closed
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
              <DropdownMenuItem onClick={openTerminal} className="gap-2 font-mono text-xs cursor-pointer">
                <Terminal className="w-3.5 h-3.5 text-green-400 shrink-0" />
                <span>Terminal</span>
                {rootPath && (
                  <span className="ml-auto text-zinc-600 truncate max-w-[60px]">
                    {rootPath.split('/').pop()}
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openBrowser} className="gap-2 font-mono text-xs cursor-pointer">
                <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>Browser</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={openClaude} className="gap-2 font-mono text-xs cursor-pointer">
                <ClaudeIcon className="w-5 h-5 text-[#D97757] shrink-0" />
                <span>Claude</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openClaudeContinue} className="gap-2 font-mono text-xs cursor-pointer">
                <ClaudeIcon className="w-5 h-5 text-[#D97757] shrink-0" />
                <span>Claude (continue)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openClaudeResume} className="gap-2 font-mono text-xs cursor-pointer">
                <ClaudeIcon className="w-5 h-5 text-[#D97757] shrink-0" />
                <span>Claude (resume)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        </div>
      </div>

      {/* Tab content */}
      <div
        ref={contentRef}
        className="flex-1 relative overflow-hidden bg-zinc-950"
        onDragOver={handleContentDragOver}
        onDragLeave={handleContentDragLeave}
        onDrop={handleContentDrop}
      >
        {group.tabs.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600"
            onContextMenu={(e) => {
              e.preventDefault()
              setCursorPos({ x: e.clientX, y: e.clientY })
              setCursorMenuOpen(true)
            }}
          >
            <div className="text-4xl">+</div>
            <p className="text-sm">Drag a tab here or open a file</p>
          </div>
        ) : (
          group.tabs.map(tab => (
            <div
              key={tab.id}
              className={cn('absolute inset-0', tab.id !== group.activeTabId && 'hidden')}
            >
              {tab.type === 'text' && (
                <TextTab
                  tabId={tab.id}
                  groupId={groupId}
                  filePath={tab.filePath}
                  isActive={tab.id === group.activeTabId}
                />
              )}
              {tab.type === 'browser' && (
                <BrowserTab
                  tabId={tab.id}
                  groupId={groupId}
                  initialUrl={tab.url}
                  isActive={tab.id === group.activeTabId}
                />
              )}
              {tab.type === 'terminal' && (
                <TerminalTab
                  tabId={tab.id}
                  groupId={groupId}
                  isActive={tab.id === group.activeTabId}
                  cwd={tab.filePath}
                  initialCommand={tab.initialCommand}
                />
              )}
              {tab.type === 'claude' && (
                <ClaudeTab
                  tabId={tab.id}
                  groupId={groupId}
                  isActive={tab.id === group.activeTabId}
                  cwd={tab.filePath}
                  initialCommand={tab.initialCommand}
                />
              )}
            </div>
          ))
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

        {/* Cmd+T cursor menu */}
        {cursorMenuOpen && (
          <DropdownMenu open onOpenChange={setCursorMenuOpen}>
            <DropdownMenuTrigger asChild>
              <div className="fixed" style={{ top: cursorPos.y, left: cursorPos.x, width: 1, height: 1 }} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44 bg-zinc-900 border-zinc-700">
              <DropdownMenuItem onClick={openTerminal} className="gap-2 font-mono text-xs cursor-pointer">
                <Terminal className="w-3.5 h-3.5 text-green-400 shrink-0" />
                <span>Terminal</span>
                {rootPath && (
                  <span className="ml-auto text-zinc-600 truncate max-w-[60px]">
                    {rootPath.split('/').pop()}
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openBrowser} className="gap-2 font-mono text-xs cursor-pointer">
                <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>Browser</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={openClaude} className="gap-2 font-mono text-xs cursor-pointer">
                <ClaudeIcon className="w-5 h-5 text-[#D97757] shrink-0" />
                <span>Claude</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openClaudeContinue} className="gap-2 font-mono text-xs cursor-pointer">
                <ClaudeIcon className="w-5 h-5 text-[#D97757] shrink-0" />
                <span>Claude (continue)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openClaudeResume} className="gap-2 font-mono text-xs cursor-pointer">
                <ClaudeIcon className="w-5 h-5 text-[#D97757] shrink-0" />
                <span>Claude (resume)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
