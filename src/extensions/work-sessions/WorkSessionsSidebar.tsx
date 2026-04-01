import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownAZ, ArrowUpDown, Bot, ChevronDown, ChevronRight, Clock, Copy, ExternalLink, Folder, FolderPlus, GitBranch, GripVertical, Hand, Hash, LayoutGrid, Link, Pencil, Square, Terminal, Trash2, X } from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'
import { getSessionTitle, setSessionTitle, clearSessionTitle } from '@/lib/session-titles'
import { useWorkSessionsStore } from '@/store/work-sessions'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore, type LayoutNode } from '@/store/layout'
import { useProjectStore, type SessionGroup, type SessionSortOrder } from '@/store/project'
import type { WorkSession } from '@/types/work-session'
import { useSessionInfoRegistry, type SessionInfoContext } from './session-info-registry'

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

const SORT_CYCLE: SessionSortOrder[] = ['none', 'created', 'alpha', 'activity', 'attached']
const SORT_LABELS: Record<SessionSortOrder, string> = {
  none: 'Manual',
  created: 'Created',
  alpha: 'A–Z',
  activity: 'Last active',
  attached: 'Attached',
}
const SORT_ICONS: Record<SessionSortOrder, typeof ArrowUpDown> = {
  none: Hand,
  created: ArrowUpDown,
  alpha: ArrowDownAZ,
  activity: Clock,
  attached: Link,
}

function sortSessions(
  sessions: EnrichedSession[],
  order: SessionSortOrder,
  groupSessionIds?: string[],
): EnrichedSession[] {
  if (order === 'none' && groupSessionIds) {
    // Respect the manual order from the group's sessionIds array
    const posMap = new Map(groupSessionIds.map((id, i) => [id, i]))
    return [...sessions].sort((a, b) => (posMap.get(a.tmux.name) ?? 999) - (posMap.get(b.tmux.name) ?? 999))
  }
  if (order === 'none' || order === 'created') return sessions
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
  isSelected,
  selectedIds,
  onRowClick,
  onDragStateChange,
}: {
  session: EnrichedSession
  isSelected: boolean
  selectedIds: Set<string>
  onRowClick: (name: string, e: React.MouseEvent) => void
  onDragStateChange: (dragging: boolean) => void
}) {
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const groups = useTabsStore(s => s.groups)

  const [isExpanded, setIsExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const infoProviders = useSessionInfoRegistry(s => s.providers)

  const openTab = (() => {
    for (const [gid, group] of Object.entries(groups)) {
      const tab = group.tabs.find(t => t.id === session.tmux.name)
      if (tab) return { tab, groupId: gid }
    }
    return null
  })()

  const label = (openTab?.tab.title) || sessionLabel(session.tmux)
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

  const status: { label: string; color: string } = isThinking
    ? { label: 'Thinking', color: 'text-blue-400' }
    : session.hasOpenTab
      ? { label: 'Idle', color: 'text-green-400' }
      : { label: 'Detached', color: 'text-amber-400' }

  const sessionType: { label: string; color: string } = (() => {
    const cmd = session.tmux.command.toLowerCase()
    if (cmd === 'claude' || session.tmux.name.startsWith('claude-code-'))
      return { label: 'Claude Code', color: 'text-orange-300' }
    if (cmd === 'codex' || session.tmux.name.startsWith('codex-'))
      return { label: 'Codex', color: 'text-emerald-300' }
    if (cmd === 'zsh') return { label: 'Shell (zsh)', color: 'text-zinc-300' }
    if (cmd === 'bash') return { label: 'Shell (bash)', color: 'text-zinc-300' }
    if (cmd === 'fish') return { label: 'Shell (fish)', color: 'text-zinc-300' }
    if (cmd) return { label: cmd, color: 'text-zinc-300' }
    return { label: 'Unknown', color: 'text-zinc-500' }
  })()

  const copyToClipboard = (text: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
  }

  return (
    <div>
      <div
        draggable
            onClick={e => onRowClick(session.tmux.name, e)}
            onDragStart={e => {
              const names = isSelected && selectedIds.size > 1
                ? [...selectedIds]
                : [session.tmux.name]
              e.dataTransfer.setData('__dragging_session__', session.tmux.name)
              e.dataTransfer.setData('__dragging_sessions__', JSON.stringify(names))
              e.dataTransfer.effectAllowed = 'move'
              // Custom drag image
              const ghost = document.createElement('div')
              ghost.textContent = names.length > 1 ? `${names.length} sessions` : label
              ghost.style.cssText = 'position:fixed;top:-1000px;padding:4px 10px;border-radius:6px;background:#27272a;color:#e4e4e7;font-size:11px;font-weight:500;white-space:nowrap;border:1px solid #3f3f46;box-shadow:0 4px 12px rgba(0,0,0,0.4);'
              document.body.appendChild(ghost)
              e.dataTransfer.setDragImage(ghost, 0, 0)
              setTimeout(() => document.body.removeChild(ghost), 0)
              setIsDragging(true)
              onDragStateChange(true)
            }}
            onDragEnd={() => {
              setIsDragging(false)
              onDragStateChange(false)
            }}
            className={`group flex items-center gap-1 rounded px-1 py-1.5 cursor-pointer transition-all ${
              isDragging
                ? 'opacity-30'
                : isSelected
                  ? 'bg-indigo-900/30 ring-1 ring-indigo-500/50'
                  : 'hover:bg-zinc-800/50'
            }`}
          >
            {/* Drag handle (visual affordance) */}
            <div className="shrink-0 cursor-grab text-zinc-500 hover:text-zinc-300 transition-colors active:cursor-grabbing">
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
                className="text-ui-base flex-1 min-w-0 bg-transparent border border-zinc-600 rounded px-1 py-0.5 outline-none text-zinc-100"
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
                <span className={`text-ui-base font-medium truncate min-w-0 flex-1 ${isThinking ? '' : 'text-zinc-200'}`}>
                  {label}
                </span>
                <span className={`text-ui-xs shrink-0 ml-1.5 ${isThinking ? '' : 'text-zinc-500'}`}>
                  {isThinking ? (thinkingTime || 'thinking') : relativeTime(session.tmux.activity)}
                </span>
              </span>
            )}

            {/* Expand chevron */}
            <button
              onClick={e => { e.stopPropagation(); setIsExpanded(!isExpanded) }}
              className="shrink-0 p-0.5 rounded text-zinc-500 hover:text-zinc-200 transition-colors"
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
                  className="shrink-0 p-0.5 rounded text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Open in tab</TooltipContent>
            </Tooltip>
          </div>

          {/* Expanded details */}
          {isExpanded && (
            <div className="ml-5 mr-1 mb-1.5 mt-0.5 py-1.5 px-2.5 rounded-md bg-zinc-800/60 border border-zinc-700/40 text-ui-xs">
              {/* Type + status row */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`font-medium ${sessionType.color}`}>{sessionType.label}</span>
                <span className="text-zinc-600">·</span>
                <span className={`font-medium ${status.color}`}>{status.label}</span>
                <div className="flex-1" />
                <span className="text-zinc-500">
                  {relativeTime(session.tmux.activity)}
                </span>
              </div>

              <div className="border-t border-zinc-700/30 pt-1.5 space-y-1">
                {/* Directory */}
                <div className="group/row flex items-center gap-1.5">
                  <Folder className="w-3 h-3 text-zinc-500 shrink-0" />
                  <span className="text-zinc-300 truncate flex-1">{session.tmux.cwd}</span>
                  <button onClick={e => copyToClipboard(session.tmux.cwd, e)} className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover/row:opacity-100">
                    <Copy className="w-2.5 h-2.5" />
                  </button>
                </div>

                {/* Branch */}
                {session.workSession?.worktree?.branch && (
                  <div className="group/row flex items-center gap-1.5">
                    <GitBranch className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span className="text-zinc-300 truncate flex-1">{session.workSession.worktree.branch}</span>
                    <span className="text-zinc-600 shrink-0">from {session.workSession.worktree.baseBranch}</span>
                  </div>
                )}

                {/* Tmux session name */}
                <div className="group/row flex items-center gap-1.5">
                  <Terminal className="w-3 h-3 text-zinc-500 shrink-0" />
                  <span className="text-zinc-400 truncate flex-1 font-mono">{session.tmux.name}</span>
                  <button onClick={e => copyToClipboard(session.tmux.name, e)} className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover/row:opacity-100">
                    <Copy className="w-2.5 h-2.5" />
                  </button>
                </div>

                {/* Claude session ID */}
                {session.workSession?.claudeSessionId && (
                  <div className="group/row flex items-center gap-1.5">
                    <Bot className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span className="text-zinc-400 truncate flex-1 font-mono">{session.workSession.claudeSessionId}</span>
                    <button onClick={e => copyToClipboard(session.workSession!.claudeSessionId!, e)} className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover/row:opacity-100">
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}

                {/* Ticket key */}
                {session.workSession?.ticketKey && (
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span className="text-zinc-300">{session.workSession.ticketKey}</span>
                  </div>
                )}

                {/* Autopilot indicator */}
                {openTab?.tab.autoPilot && (
                  <div className="flex items-center gap-1.5">
                    <Bot className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span className="text-indigo-400 font-medium">Autopilot</span>
                  </div>
                )}

                {/* Extension-provided rows */}
                {infoProviders.map(p => {
                  const ctx: SessionInfoContext = {
                    tmuxName: session.tmux.name,
                    cwd: session.tmux.cwd,
                    command: session.tmux.command,
                    connected: session.tmux.connected,
                    hasOpenTab: session.hasOpenTab,
                    isThinking,
                    workSession: session.workSession,
                  }
                  const node = p.render(ctx)
                  return node ? <React.Fragment key={p.id}>{node}</React.Fragment> : null
                })}
              </div>
            </div>
          )}
    </div>
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
              <span className="text-ui-base font-medium text-zinc-400">{session.ticketKey}</span>
              <span className="text-ui-xs text-red-400/70">tmux dead</span>
            </div>
            {session.worktree?.branch && (
              <div className="flex items-center gap-1 mt-0.5">
                <GitBranch className="w-2.5 h-2.5 text-zinc-600" />
                <span className="text-ui-xs text-zinc-500 truncate">{session.worktree.branch}</span>
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
        <ContextMenuItem className="gap-2 text-ui-base cursor-pointer" onSelect={handleComplete}>
          <Square className="w-3.5 h-3.5" />
          Mark completed
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleDelete} className="gap-2 text-ui-base cursor-pointer text-red-400 focus:text-red-300">
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
  onDragStateChange,
  isDraggingActive,
  isManualSort,
  onRefresh,
  sessionToGroup,
}: {
  group: SessionGroup | null
  sessions: EnrichedSession[]
  selectedIds: Set<string>
  onRowClick: (name: string, e: React.MouseEvent) => void
  onDragStateChange: (dragging: boolean) => void
  isDraggingActive: boolean
  isManualSort: boolean
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
  const [dropInsertIdx, setDropInsertIdx] = useState<number | null>(null)
  const rowsRef = useRef<HTMLDivElement>(null)

  // Clear drop indicator when drag ends globally
  useEffect(() => {
    if (!isDraggingActive) {
      setDropInsertIdx(null)
      setIsDragOver(false)
    }
  }, [isDraggingActive])

  function getDraggedNames(e: React.DragEvent): string[] {
    const multi = e.dataTransfer.getData('__dragging_sessions__')
    if (multi) {
      try {
        const names: string[] = JSON.parse(multi)
        if (names.length > 0) return names
      } catch {}
    }
    const single = e.dataTransfer.getData('__dragging_session__')
    return single ? [single] : []
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('__dragging_session__')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)

    // Calculate insertion index from mouse position for manual reordering
    if (isManualSort && rowsRef.current) {
      const children = Array.from(rowsRef.current.children) as HTMLElement[]
      // Skip indicator elements (they have h-0.5 class) — only measure session rows
      const rows = children.filter(c => c.dataset.sessionRow)
      let idx = rows.length
      const DEAD_ZONE = 6 // px hysteresis to prevent jitter near midpoints
      for (let i = 0; i < rows.length; i++) {
        const rect = rows[i].getBoundingClientRect()
        const mid = rect.top + rect.height / 2
        if (e.clientY < mid - DEAD_ZONE) {
          idx = i
          break
        } else if (e.clientY < mid + DEAD_ZONE) {
          // Inside dead zone — keep current index to avoid jitter
          return
        }
      }
      if (idx !== dropInsertIdx) setDropInsertIdx(idx)
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
    setDropInsertIdx(null)
  }

  function handleDrop(e: React.DragEvent) {
    const insertIdx = dropInsertIdx
    setIsDragOver(false)
    setDropInsertIdx(null)
    e.preventDefault()
    const names = getDraggedNames(e)
    if (names.length === 0) return

    if (isManualSort && insertIdx !== null) {
      // Manual reorder — insert at specific position
      const store = useProjectStore.getState()
      const beforeSession = sessions[insertIdx]?.tmux.name ?? null
      for (const name of names) {
        if (group) {
          const srcGroup = sessionToGroup.get(name)
          if (srcGroup !== group.id) {
            store.addSessionsToGroup(group.id, [name])
          }
          store.reorderSessionInGroup(group.id, name, beforeSession)
        } else {
          // Ungrouped reorder — remove from any group first
          const srcGroup = sessionToGroup.get(name)
          if (srcGroup) store.removeSessionFromGroup(srcGroup, name)
          store.reorderUngroupedSession(name, beforeSession)
        }
      }
    } else if (group) {
      useProjectStore.getState().addSessionsToGroup(group.id, names)
    } else {
      // Ungrouped — remove from groups
      const store = useProjectStore.getState()
      for (const name of names) {
        const gid = sessionToGroup.get(name)
        if (gid) store.removeSessionFromGroup(gid, name)
      }
    }
  }

  return (
    <div
      className={`mb-3 rounded transition-colors ${
        isDragOver
          ? 'bg-indigo-900/20'
          : isDraggingActive
            ? 'bg-zinc-800/20'
            : ''
      }`}
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
            className="text-ui-xs flex-1 min-w-0 bg-transparent border border-zinc-600 rounded px-1 py-0.5 outline-none text-zinc-100 font-medium uppercase tracking-wider"
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
            className="text-ui-xs font-medium uppercase tracking-wider text-zinc-300 flex-1 min-w-0 truncate"
            onDoubleClick={group ? () => startRename() : undefined}
          >
            {label}
          </span>
        )}

        <span className="text-ui-xs text-zinc-700">{sessions.length}</span>

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
          <div ref={rowsRef}>
            {sessions.map((s, i) => (
              <React.Fragment key={s.tmux.name}>
                {dropInsertIdx === i && (
                  <div className="mx-1 h-0.5 bg-indigo-400 rounded-full my-0.5" />
                )}
                <div data-session-row>
                  <TmuxRow
                    session={s}
                    isSelected={selectedIds.has(s.tmux.name)}
                    selectedIds={selectedIds}
                    onRowClick={onRowClick}
                    onDragStateChange={onDragStateChange}
                  />
                </div>
              </React.Fragment>
            ))}
            {dropInsertIdx !== null && dropInsertIdx >= sessions.length && (
              <div className="mx-1 h-0.5 bg-indigo-400 rounded-full my-0.5" />
            )}
          </div>
        ) : (
          <div className="px-2 py-1 text-ui-xs text-zinc-700 italic">No active sessions</div>
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
  const ungroupedOrder = useProjectStore(s => s.ungroupedSessionOrder)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedRef = useRef<string | null>(null)
  const [isDraggingActive, setIsDraggingActive] = useState(false)

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
    const group = sessionGroups.find(g => g.id === gid)
    groupedSessions.set(gid, sortSessions(sessions, sessionSort, group?.sessionIds))
  }
  const ungrouped = sortSessions(ungroupedRaw, sessionSort, ungroupedOrder)

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
      // Plain click: select or deselect
      setSelectedIds(prev => prev.size === 1 && prev.has(name) ? new Set() : new Set([name]))
      lastClickedRef.current = name
    }
  }, [flatSessionOrder])

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

  const subtitle = undefined

  const SortIcon = SORT_ICONS[sessionSort]

  return (
    <SidebarLayout
      title="Sessions"
      subtitle={subtitle}
      actions={[
        {
          icon: FolderPlus,
          label: 'New group',
          onClick: () => useProjectStore.getState().addSessionGroup('New Group', []),
        },
      ]}
    >
      <div className="p-1">
        {/* Sort toolbar */}
        <div className="px-2 py-1 mb-2 border-b border-zinc-700/50 pb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-ui-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                <SortIcon className="w-3 h-3" />
                <span>Sort: {SORT_LABELS[sessionSort]}</span>
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-zinc-900 border-zinc-700" align="start">
              <DropdownMenuRadioGroup
                value={sessionSort}
                onValueChange={v => useProjectStore.getState().setSessionSort(v as SessionSortOrder)}
              >
                {SORT_CYCLE.map(order => {
                  const Icon = SORT_ICONS[order]
                  return (
                    <DropdownMenuRadioItem key={order} value={order} className="gap-2 text-ui-base cursor-pointer">
                      <Icon className="w-3.5 h-3.5" />
                      {SORT_LABELS[order]}
                    </DropdownMenuRadioItem>
                  )
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

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
              onDragStateChange={setIsDraggingActive}
              isDraggingActive={isDraggingActive}
              isManualSort={sessionSort === 'none'}
              onRefresh={refresh}
              sessionToGroup={sessionToGroup}
            />
          )
        })}

        {/* Ungrouped sessions (always visible) */}
        <SessionGroupSection
          group={null}
          sessions={ungrouped}
          selectedIds={selectedIds}
          onRowClick={handleRowClick}
          onDragStateChange={setIsDraggingActive}
          isDraggingActive={isDraggingActive}
          isManualSort={sessionSort === 'none'}
          onRefresh={refresh}
          sessionToGroup={sessionToGroup}
        />

        {/* Stale work sessions */}
        {orphanedWorkSessions.length > 0 && (
          <div className="mb-3">
            <div className="px-2 mb-1 text-ui-xs font-medium uppercase tracking-wider text-zinc-300">
              Stale
            </div>
            {orphanedWorkSessions.map(ws => (
              <OrphanedWorkSessionRow key={ws.id} session={ws} onAction={refresh} />
            ))}
          </div>
        )}

        {/* Selection action bar */}
        {selectedIds.size > 0 && (
          <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-700/50 p-2 mt-2 rounded">
            <div className="flex items-center gap-2 text-ui-xs">
              <span className="text-zinc-400 font-medium">{selectedIds.size} selected</span>
              <div className="flex-1" />
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Clear
              </button>
            </div>

            <div className="mt-1.5">
              <button
                onClick={killSelected}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 text-ui-xs transition-colors"
              >
                <Square className="w-3 h-3" />
                Kill all
              </button>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  )
}
