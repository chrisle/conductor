import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownAZ, ArrowUpDown, ChevronDown, ChevronRight, Clock, ExternalLink, FolderPlus, GitBranch, GripVertical, LayoutGrid, Link, Pencil, Square, Trash2, X } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'
import { getSessionTitle, setSessionTitle, clearSessionTitle } from '@/lib/session-titles'
import { useWorkSessionsStore } from '@/store/work-sessions'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore, type LayoutNode } from '@/store/layout'
import { useProjectStore, type SessionGroup, type SessionSortOrder } from '@/store/project'
import type { WorkSession } from '@/types/work-session'

// ── Types ──────────────────────────────────────────────

interface TmuxSession {
  name: string
  connected: boolean
  command: string
  cwd: string
  created: number
  activity: number
}

/** A live tmux session enriched with work-session + tab context */
interface EnrichedSession {
  tmux: TmuxSession
  workSession: WorkSession | null
  /** Ticket key derived from tmux name (t-NP3-14 → NP3-14) */
  ticketKey: string | null
  /** Whether an open tab is attached to this tmux session */
  hasOpenTab: boolean
}

// ── Helpers ────────────────────────────────────────────

function relativeTime(epoch: number): string {
  const diff = Date.now() - epoch * 1000
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function ticketKeyFromTmuxName(name: string): string | null {
  if (name.startsWith('t-')) return name.slice(2).toUpperCase()
  return null
}

/** Human-readable label for a tmux session */
function sessionLabel(tmux: TmuxSession): string {
  const custom = getSessionTitle(tmux.name)
  if (custom) return custom
  const ticket = ticketKeyFromTmuxName(tmux.name)
  if (ticket) return ticket
  if (tmux.name.startsWith('claude-code-') || tmux.name.startsWith('codex-')) return tmux.name
  const base = tmux.cwd.split('/').filter(Boolean).pop()
  return base ? `shell · ${base}` : tmux.name
}

const SORT_CYCLE: SessionSortOrder[] = ['created', 'alpha', 'activity', 'attached']
const SORT_LABELS: Record<SessionSortOrder, string> = {
  created: 'Created',
  alpha: 'A–Z',
  activity: 'Last active',
  attached: 'Attached',
}
const SORT_ICONS: Record<SessionSortOrder, typeof ArrowUpDown> = {
  created: ArrowUpDown,
  alpha: ArrowDownAZ,
  activity: Clock,
  attached: Link,
}

function sortSessions(sessions: EnrichedSession[], order: SessionSortOrder): EnrichedSession[] {
  if (order === 'created') return sessions // tmux returns in creation order
  const sorted = [...sessions]
  if (order === 'alpha') {
    sorted.sort((a, b) => sessionLabel(a.tmux).localeCompare(sessionLabel(b.tmux)))
  } else if (order === 'activity') {
    sorted.sort((a, b) => b.tmux.activity - a.tmux.activity)
  } else if (order === 'attached') {
    sorted.sort((a, b) => (b.hasOpenTab ? 1 : 0) - (a.hasOpenTab ? 1 : 0))
  }
  return sorted
}

function buildTileTree(ids: string[], depth: number): LayoutNode {
  if (ids.length === 1) return { type: 'leaf', groupId: ids[0] }
  const mid = Math.ceil(ids.length / 2)
  return {
    type: 'split',
    direction: depth % 2 === 0 ? 'horizontal' : 'vertical',
    ratio: 0.5,
    first: buildTileTree(ids.slice(0, mid), depth + 1),
    second: buildTileTree(ids.slice(mid), depth + 1),
  }
}

// ── Data hook ──────────────────────────────────────────

function useTmuxSessions(intervalMs = 5_000) {
  const [sessions, setSessions] = useState<TmuxSession[]>([])
  const workSessions = useWorkSessionsStore(s => s.sessions)
  const groups = useTabsStore(s => s.groups)

  const refresh = useCallback(async () => {
    try {
      const list = await window.electronAPI.conductordGetTmuxSessions()
      setSessions(list)

      // Reconcile: prune references to tmux sessions that no longer exist
      const liveNames = new Set(list.map((s: TmuxSession) => s.name))

      // Remove dead session IDs from session groups
      const projectState = useProjectStore.getState()
      for (const sg of projectState.sessionGroups) {
        for (const sid of sg.sessionIds) {
          if (!liveNames.has(sid)) {
            projectState.removeSessionFromGroup(sg.id, sid)
          }
        }
      }

      // Mark orphaned work sessions as completed
      const wsStore = useWorkSessionsStore.getState()
      for (const ws of wsStore.sessions) {
        if (ws.status === 'active' && ws.tmuxSessionId && !liveNames.has(ws.tmuxSessionId)) {
          wsStore.completeSession(ws.id)
        }
      }
    } catch {
      setSessions([])
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [refresh, intervalMs])

  const openTabIds = new Set<string>()
  for (const group of Object.values(groups)) {
    for (const tab of group.tabs) {
      openTabIds.add(tab.id)
    }
  }

  const wsMap = new Map<string, WorkSession>()
  for (const ws of workSessions) {
    if (ws.tmuxSessionId) wsMap.set(ws.tmuxSessionId, ws)
  }

  const enriched: EnrichedSession[] = sessions
    .map(tmux => ({
      tmux,
      workSession: wsMap.get(tmux.name) ?? null,
      ticketKey: ticketKeyFromTmuxName(tmux.name),
      hasOpenTab: openTabIds.has(tmux.name),
    }))

  const liveTmuxNames = new Set(sessions.map(s => s.name))
  const orphanedWorkSessions = workSessions.filter(
    ws => ws.status === 'active' && ws.tmuxSessionId && !liveTmuxNames.has(ws.tmuxSessionId)
  )

  return { enriched, orphanedWorkSessions, refresh, liveTmuxNames }
}

// ── Tile helper ───────────────────────────────────────

function tileSessions(sessions: EnrichedSession[]) {
  if (sessions.length === 0) return

  const tabsStore = useTabsStore.getState()
  const layoutStore = useLayoutStore.getState()
  const currentRoot = layoutStore.root
  if (!currentRoot) return

  // Find each session's tab and move it into its own new group
  const newGroupIds: string[] = []
  for (const s of sessions) {
    for (const [gid, group] of Object.entries(tabsStore.groups)) {
      if (group.tabs.find(t => t.id === s.tmux.name)) {
        const newGid = tabsStore.createGroup()
        tabsStore.moveTab(gid, s.tmux.name, newGid)
        newGroupIds.push(newGid)
        break
      }
    }
  }
  if (newGroupIds.length === 0) return

  // Build a vertical stack for the tiled sessions
  const tileTree = buildTileTree(newGroupIds, 0)

  // Insert as a horizontal split: tiled group on the left, existing layout on the right
  layoutStore.setRoot({
    type: 'split',
    direction: 'horizontal',
    ratio: 0.5,
    first: tileTree,
    second: currentRoot,
  })
  layoutStore.setFocusedGroup(newGroupIds[0])
}

// ── Row components ─────────────────────────────────────

function TmuxRow({
  session,
  onAction,
  isSelected,
  onRowClick,
  currentGroupId,
}: {
  session: EnrichedSession
  onAction: () => void
  isSelected: boolean
  onRowClick: (name: string, e: React.MouseEvent) => void
  currentGroupId: string | null
}) {
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const sessionsStore = useWorkSessionsStore.getState()
  const groups = useTabsStore(s => s.groups)
  const sessionGroups = useProjectStore(s => s.sessionGroups)

  const [isExpanded, setIsExpanded] = useState(false)

  const openTab = (() => {
    for (const [gid, group] of Object.entries(groups)) {
      const tab = group.tabs.find(t => t.id === session.tmux.name)
      if (tab) return { tab, groupId: gid }
    }
    return null
  })()

  const label = openTab ? openTab.tab.title : sessionLabel(session.tmux)
  const isThinking = openTab?.tab.isThinking ?? false
  const thinkingTime = openTab?.tab.thinkingTime

  // Inline rename
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  function startRename() {
    setRenameValue(label)
    setIsRenaming(true)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  function commitRename() {
    if (renameValue.trim()) {
      const title = renameValue.trim()
      setSessionTitle(session.tmux.name, title)
      if (openTab) {
        useTabsStore.getState().updateTab(openTab.groupId, openTab.tab.id, { title })
      }
    }
    setIsRenaming(false)
  }

  const openInTab = (e: React.MouseEvent) => {
    e.stopPropagation()

    const layoutGroupIds = new Set(useLayoutStore.getState().getAllGroupIds())

    // Focus existing tab if already open in a visible group
    if (openTab) {
      if (layoutGroupIds.has(openTab.groupId)) {
        useTabsStore.getState().setActiveTab(openTab.groupId, openTab.tab.id)
        useLayoutStore.getState().setFocusedGroup(openTab.groupId)
        return
      }
      // Tab exists in a group not in the layout — remove the stale tab
      useTabsStore.getState().removeTab(openTab.groupId, openTab.tab.id)
    }

    const tabsState = useTabsStore.getState()
    const allGroups = tabsState.groups
    let targetGroup = focusedGroupId && allGroups[focusedGroupId] && layoutGroupIds.has(focusedGroupId)
      ? focusedGroupId
      : [...layoutGroupIds].find(gid => allGroups[gid]) || Object.keys(allGroups)[0]
    if (!targetGroup) {
      targetGroup = tabsState.createGroup()
    }
    addTab(targetGroup, {
      id: session.tmux.name,
      type: 'claude-code',
      title: label,
      filePath: session.workSession?.worktree?.path || session.tmux.cwd,
    })
  }

  const closeOpenTab = (sessionName: string) => {
    const groups = useTabsStore.getState().groups
    for (const [groupId, group] of Object.entries(groups)) {
      if (group.tabs.some(t => t.id === sessionName)) {
        useTabsStore.getState().removeTab(groupId, sessionName)
        break
      }
    }
  }

  const killTmux = async () => {
    await window.electronAPI.conductordKillTmuxSession(session.tmux.name)
    clearSessionTitle(session.tmux.name)
    if (session.workSession && session.workSession.status === 'active') {
      await sessionsStore.completeSession(session.workSession.id)
    }
    if (currentGroupId) {
      useProjectStore.getState().removeSessionFromGroup(currentGroupId, session.tmux.name)
    }
    closeOpenTab(session.tmux.name)
    onAction()
  }

  const deleteSession = async () => {
    await window.electronAPI.conductordKillTmuxSession(session.tmux.name)
    clearSessionTitle(session.tmux.name)
    if (session.workSession) {
      await sessionsStore.deleteSession(session.workSession.id)
    }
    if (currentGroupId) {
      useProjectStore.getState().removeSessionFromGroup(currentGroupId, session.tmux.name)
    }
    closeOpenTab(session.tmux.name)
    onAction()
  }

  const cwdShort = (() => {
    const parts = session.tmux.cwd.split('/').filter(Boolean)
    return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : session.tmux.cwd
  })()

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div>
          <div
            onClick={e => onRowClick(session.tmux.name, e)}
            className={`group flex items-center gap-1 rounded px-1 py-1.5 cursor-pointer transition-colors ${
              isSelected
                ? 'bg-indigo-900/30 ring-1 ring-indigo-500/50'
                : 'hover:bg-zinc-800/50'
            }`}
          >
            {/* Drag handle */}
            <div
              draggable
              onDragStart={e => {
                e.stopPropagation()
                e.dataTransfer.setData('__dragging_session__', session.tmux.name)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onClick={e => e.stopPropagation()}
              className="shrink-0 cursor-grab text-zinc-700 hover:text-zinc-500 transition-colors active:cursor-grabbing"
            >
              <GripVertical className="w-3 h-3" />
            </div>

            {/* Status dot */}
            {isThinking ? (
              <span className="w-2.5 h-2.5 shrink-0 rounded-full border border-zinc-500 border-t-zinc-200 animate-spin" style={{ animationDuration: '1.5s' }} />
            ) : (
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                session.hasOpenTab ? 'bg-green-400' : 'bg-amber-400'
              }`} />
            )}

            {/* Label + secondary info */}
            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="text-xs flex-1 min-w-0 bg-transparent border border-zinc-600 rounded px-1 py-0.5 outline-none text-zinc-100"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setIsRenaming(false)
                  e.stopPropagation()
                }}
                onBlur={commitRename}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span
                className={`flex items-center min-w-0 flex-1 ${isThinking ? 'text-shimmer' : ''}`}
                onDoubleClick={e => { e.stopPropagation(); startRename() }}
              >
                <span className={`text-xs font-medium truncate min-w-0 flex-1 ${isThinking ? '' : 'text-zinc-300'}`}>
                  {label}
                </span>
                <span className={`text-[10px] shrink-0 ml-1.5 ${isThinking ? '' : 'text-zinc-600'}`}>
                  {isThinking ? (thinkingTime || 'thinking') : relativeTime(session.tmux.activity)}
                </span>
              </span>
            )}

            {/* Expand chevron */}
            <button
              onClick={e => { e.stopPropagation(); setIsExpanded(!isExpanded) }}
              className="shrink-0 p-0.5 rounded text-zinc-700 hover:text-zinc-400 transition-colors opacity-0 group-hover:opacity-100"
              style={isExpanded ? { opacity: 1 } : undefined}
            >
              {isExpanded
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />
              }
            </button>

            {/* Open in tab */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={openInTab}
                  className="shrink-0 p-0.5 rounded text-zinc-700 hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Open in tab</TooltipContent>
            </Tooltip>
          </div>

          {/* Expanded details */}
          {isExpanded && (
            <div className="ml-7 mr-2 mb-1 py-1 px-2 rounded bg-zinc-800/50 text-[10px] text-zinc-500 space-y-0.5">
              <div className="flex items-center gap-1 truncate">
                <span className="text-zinc-600">cwd</span>
                <span className="text-zinc-400 truncate">{cwdShort}</span>
              </div>
              {session.workSession?.worktree?.branch && (
                <div className="flex items-center gap-1 truncate">
                  <GitBranch className="w-2.5 h-2.5 text-zinc-600 shrink-0" />
                  <span className="text-zinc-400 truncate">{session.workSession.worktree.branch}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span><span className="text-zinc-600">created</span> {relativeTime(session.tmux.created)}</span>
                <span><span className="text-zinc-600">active</span> {relativeTime(session.tmux.activity)}</span>
              </div>
              <div className="text-zinc-600 truncate">{session.tmux.name}</div>
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44 bg-zinc-900 border-zinc-700">
        <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={startRename}>
          <Pencil className="w-3.5 h-3.5" />
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator className="bg-zinc-700" />
        {/* Move to group submenu */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2 text-xs cursor-pointer">Move to group</ContextMenuSubTrigger>
          <ContextMenuSubContent className="bg-zinc-900 border-zinc-700">
            {sessionGroups.map(g => (
              <ContextMenuItem
                key={g.id}
                className="text-xs cursor-pointer"
                disabled={g.id === currentGroupId}
                onSelect={() => useProjectStore.getState().addSessionsToGroup(g.id, [session.tmux.name])}
              >
                {g.name}
              </ContextMenuItem>
            ))}
            {sessionGroups.length > 0 && <ContextMenuSeparator className="bg-zinc-700" />}
            <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={() => {
              useProjectStore.getState().addSessionGroup('New Group', [session.tmux.name])
            }}>
              <FolderPlus className="w-3.5 h-3.5" />
              New group...
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        {currentGroupId && (
          <ContextMenuItem className="text-xs cursor-pointer" onSelect={() => {
            useProjectStore.getState().removeSessionFromGroup(currentGroupId, session.tmux.name)
          }}>
            Remove from group
          </ContextMenuItem>
        )}
        <ContextMenuSeparator className="bg-zinc-700" />
        <ContextMenuItem onSelect={killTmux} className="gap-2 text-xs cursor-pointer text-red-400 focus:text-red-300">
          <Square className="w-3.5 h-3.5" />
          Kill session
        </ContextMenuItem>
        {session.workSession && (
          <ContextMenuItem onSelect={deleteSession} className="gap-2 text-xs cursor-pointer text-red-400 focus:text-red-300">
            <Trash2 className="w-3.5 h-3.5" />
            Kill &amp; delete record
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function OrphanedWorkSessionRow({
  session,
  onAction,
}: {
  session: WorkSession
  onAction: () => void
}) {
  const store = useWorkSessionsStore.getState()

  const handleDelete = async () => {
    await store.deleteSession(session.id)
    onAction()
  }

  const handleComplete = async () => {
    await store.completeSession(session.id)
    onAction()
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="group w-full flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-800/50 transition-colors">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-red-400/60" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-zinc-400">{session.ticketKey}</span>
              <span className="text-[10px] text-red-400/70">tmux dead</span>
            </div>
            {session.worktree?.branch && (
              <div className="flex items-center gap-1 mt-0.5">
                <GitBranch className="w-2.5 h-2.5 text-zinc-600" />
                <span className="text-[10px] text-zinc-500 truncate">{session.worktree.branch}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); handleComplete() }}
                  className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <Square className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Mark completed</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete() }}
                  className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Delete record</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44 bg-zinc-900 border-zinc-700">
        <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={handleComplete}>
          <Square className="w-3.5 h-3.5" />
          Mark completed
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleDelete} className="gap-2 text-xs cursor-pointer text-red-400 focus:text-red-300">
          <Trash2 className="w-3.5 h-3.5" />
          Delete record
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ── Group section ─────────────────────────────────────

function SessionGroupSection({
  group,
  sessions,
  selectedIds,
  onRowClick,
  onRefresh,
  sessionToGroup,
}: {
  group: SessionGroup | null
  sessions: EnrichedSession[]
  selectedIds: Set<string>
  onRowClick: (name: string, e: React.MouseEvent) => void
  onRefresh: () => void
  sessionToGroup: Map<string, string>
}) {
  const [isOpen, setIsOpen] = useState(true)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const label = group?.name ?? 'Ungrouped'
  const attachedInGroup = sessions.filter(s => s.hasOpenTab)
  const canTile = attachedInGroup.length > 1

  function startRename() {
    if (!group) return
    setRenameValue(group.name)
    setIsRenaming(true)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  function commitRename() {
    if (group && renameValue.trim()) {
      useProjectStore.getState().renameSessionGroup(group.id, renameValue.trim())
    }
    setIsRenaming(false)
  }

  function handleDelete() {
    if (group) useProjectStore.getState().removeSessionGroup(group.id)
  }

  const [isDragOver, setIsDragOver] = useState(false)

  function handleDragOver(e: React.DragEvent) {
    if (!group) return
    if (!e.dataTransfer.types.includes('__dragging_session__')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear when leaving the container itself, not children
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    setIsDragOver(false)
    if (!group) return
    const sessionName = e.dataTransfer.getData('__dragging_session__')
    if (!sessionName) return
    e.preventDefault()
    useProjectStore.getState().addSessionsToGroup(group.id, [sessionName])
  }

  return (
    <div
      className={`mb-3 rounded transition-colors ${isDragOver ? 'bg-indigo-900/20 ring-1 ring-indigo-500/40' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="px-2 mb-1 flex items-center gap-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          {isOpen
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />
          }
        </button>

        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="text-[10px] flex-1 min-w-0 bg-transparent border border-zinc-600 rounded px-1 py-0.5 outline-none text-zinc-100 font-medium uppercase tracking-wider"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setIsRenaming(false)
              e.stopPropagation()
            }}
            onBlur={commitRename}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className="text-[10px] font-medium uppercase tracking-wider text-zinc-600 flex-1 min-w-0 truncate"
            onDoubleClick={group ? () => startRename() : undefined}
          >
            {label}
          </span>
        )}

        <span className="text-[10px] text-zinc-700">{sessions.length}</span>

        <div className="flex items-center gap-0.5">
          {canTile && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => tileSessions(attachedInGroup)}
                  className="p-0.5 rounded hover:bg-zinc-700 text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  <LayoutGrid className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Tile group</TooltipContent>
            </Tooltip>
          )}

          {group && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={startRename}
                    className="p-0.5 rounded hover:bg-zinc-700 text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Rename group</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleDelete}
                    className="p-0.5 rounded hover:bg-zinc-700 text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete group</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {isOpen && (
        sessions.length > 0 ? (
          sessions.map(s => (
            <TmuxRow
              key={s.tmux.name}
              session={s}
              onAction={onRefresh}
              isSelected={selectedIds.has(s.tmux.name)}
              onRowClick={onRowClick}
              currentGroupId={sessionToGroup.get(s.tmux.name) ?? null}
            />
          ))
        ) : (
          <div className="px-2 py-1 text-[10px] text-zinc-700 italic">No active sessions</div>
        )
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────

export default function WorkSessionsSidebar({ groupId }: { groupId: string }): React.ReactElement {
  const { enriched, orphanedWorkSessions, refresh } = useTmuxSessions()
  const sessionGroups = useProjectStore(s => s.sessionGroups)
  const sessionSort = useProjectStore(s => s.sessionSort)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [namingGroup, setNamingGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const lastClickedRef = useRef<string | null>(null)

  // Build sessionId → groupId lookup
  const sessionToGroup = new Map<string, string>()
  for (const g of sessionGroups) {
    for (const sid of g.sessionIds) {
      sessionToGroup.set(sid, g.id)
    }
  }

  // Partition enriched sessions by group, then sort each bucket
  const groupedSessions = new Map<string, EnrichedSession[]>()
  const ungroupedRaw: EnrichedSession[] = []

  for (const s of enriched) {
    const gid = sessionToGroup.get(s.tmux.name)
    if (gid) {
      if (!groupedSessions.has(gid)) groupedSessions.set(gid, [])
      groupedSessions.get(gid)!.push(s)
    } else {
      ungroupedRaw.push(s)
    }
  }

  // Apply sort to each bucket
  for (const [gid, sessions] of groupedSessions) {
    groupedSessions.set(gid, sortSessions(sessions, sessionSort))
  }
  const ungrouped = sortSessions(ungroupedRaw, sessionSort)

  // Flat ordered list of all session names matching render order (for shift-click range)
  const flatSessionOrder: string[] = []
  for (const group of sessionGroups) {
    for (const s of (groupedSessions.get(group.id) || [])) flatSessionOrder.push(s.tmux.name)
  }
  for (const s of ungrouped) flatSessionOrder.push(s.tmux.name)

  // Escape clears selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIds.size > 0) {
        setSelectedIds(new Set())
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedIds.size])

  const handleRowClick = useCallback((name: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+click: toggle individual item
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(name)) next.delete(name)
        else next.add(name)
        return next
      })
      lastClickedRef.current = name
    } else if (e.shiftKey && lastClickedRef.current) {
      // Shift+click: add/remove range from last clicked to here
      const lastIdx = flatSessionOrder.indexOf(lastClickedRef.current)
      const curIdx = flatSessionOrder.indexOf(name)
      if (lastIdx !== -1 && curIdx !== -1) {
        const start = Math.min(lastIdx, curIdx)
        const end = Math.max(lastIdx, curIdx)
        const rangeNames = flatSessionOrder.slice(start, end + 1)
        setSelectedIds(prev => {
          const next = new Set(prev)
          // If the clicked item is already selected, remove the range; otherwise add it
          const removing = prev.has(name)
          for (const n of rangeNames) {
            if (removing) next.delete(n)
            else next.add(n)
          }
          return next
        })
      }
    } else {
      // Plain click: select only this one
      setSelectedIds(new Set([name]))
      lastClickedRef.current = name
    }
  }, [flatSessionOrder])

  function cycleSort() {
    const idx = SORT_CYCLE.indexOf(sessionSort)
    const next = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]
    useProjectStore.getState().setSessionSort(next)
  }

  function handleCreateGroup() {
    setGroupName('')
    setNamingGroup(true)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  function commitCreateGroup() {
    const name = groupName.trim() || 'New Group'
    useProjectStore.getState().addSessionGroup(name, [...selectedIds])
    setSelectedIds(new Set())
    setNamingGroup(false)
  }

  function handleAddToGroup(groupId: string) {
    useProjectStore.getState().addSessionsToGroup(groupId, [...selectedIds])
    setSelectedIds(new Set())
  }

  async function killSelected() {
    const sessionsStore = useWorkSessionsStore.getState()
    const tabsState = useTabsStore.getState()
    const projectState = useProjectStore.getState()

    for (const name of selectedIds) {
      await window.electronAPI.conductordKillTmuxSession(name)
      clearSessionTitle(name)

      // Complete associated work session
      const match = enriched.find(s => s.tmux.name === name)
      if (match?.workSession?.status === 'active') {
        await sessionsStore.completeSession(match.workSession.id)
      }

      // Remove from session group
      const gid = sessionToGroup.get(name)
      if (gid) projectState.removeSessionFromGroup(gid, name)

      // Close open tab
      for (const [groupId, group] of Object.entries(tabsState.groups)) {
        if (group.tabs.some(t => t.id === name)) {
          tabsState.removeTab(groupId, name)
          break
        }
      }
    }

    setSelectedIds(new Set())
    refresh()
  }

  const subtitle = enriched.length > 0
    ? `${enriched.length} live`
    : undefined

  const SortIcon = SORT_ICONS[sessionSort]

  return (
    <SidebarLayout
      title="Sessions"
      subtitle={subtitle}
      actions={[
        {
          icon: SortIcon,
          label: `Sort: ${SORT_LABELS[sessionSort]}`,
          onClick: cycleSort,
        },
      ]}
    >
      <div className="p-1">
        {enriched.length === 0 && orphanedWorkSessions.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-600">
            No tmux sessions running.
          </div>
        ) : (
          <>
            {/* User-defined groups */}
            {sessionGroups.map(group => {
              const sessions = groupedSessions.get(group.id) || []
              return (
                <SessionGroupSection
                  key={group.id}
                  group={group}
                  sessions={sessions}
                  selectedIds={selectedIds}
                  onRowClick={handleRowClick}
                  onRefresh={refresh}
                  sessionToGroup={sessionToGroup}
                />
              )
            })}

            {/* Ungrouped sessions */}
            {ungrouped.length > 0 && (
              <SessionGroupSection
                group={null}
                sessions={ungrouped}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onRefresh={refresh}
                sessionToGroup={sessionToGroup}
              />
            )}

            {/* Stale work sessions */}
            {orphanedWorkSessions.length > 0 && (
              <div className="mb-3">
                <div className="px-2 mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                  Stale
                </div>
                {orphanedWorkSessions.map(ws => (
                  <OrphanedWorkSessionRow key={ws.id} session={ws} onAction={refresh} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Selection action bar */}
        {selectedIds.size > 0 && (
          <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-700/50 p-2 mt-2 rounded">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-zinc-400 font-medium">{selectedIds.size} selected</span>
              <div className="flex-1" />
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Clear
              </button>
            </div>

            {namingGroup ? (
              <div className="mt-2 flex items-center gap-1">
                <input
                  ref={nameInputRef}
                  className="text-xs flex-1 min-w-0 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 outline-none text-zinc-100 placeholder-zinc-600"
                  placeholder="Group name"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitCreateGroup()
                    if (e.key === 'Escape') setNamingGroup(false)
                    e.stopPropagation()
                  }}
                  onBlur={commitCreateGroup}
                />
              </div>
            ) : (
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={handleCreateGroup}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50 text-[10px] transition-colors"
                >
                  <FolderPlus className="w-3 h-3" />
                  New group
                </button>
                {sessionGroups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => handleAddToGroup(g.id)}
                    className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 text-[10px] transition-colors"
                  >
                    {g.name}
                  </button>
                ))}
                <button
                  onClick={killSelected}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 text-[10px] transition-colors ml-auto"
                >
                  <Square className="w-3 h-3" />
                  Kill {selectedIds.size}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </SidebarLayout>
  )
}
