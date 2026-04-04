import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownAZ, ArrowUpDown, Bot, ChevronDown, ChevronRight, Clock, Copy, Folder, FolderOpen, FolderPlus, GitBranch, Hand, Hash, Info, Key, LayoutGrid, Link, Pencil, Square, Terminal, Trash2, X } from 'lucide-react'
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
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'
import { getSessionTitle, setSessionTitle, clearSessionTitle } from '@/lib/session-titles'
import { clearSessionAutoPilot } from '@/lib/session-autopilot'
import { useWorkSessionsStore } from '@/store/work-sessions'
import { useTabsStore } from '@/store/tabs'
import { useConfigStore } from '@/store/config'
import { useLayoutStore, type LayoutNode } from '@/store/layout'
import { useProjectStore, type SessionGroup, type SessionSortOrder } from '@/store/project'
import type { WorkSession } from '@/types/work-session'
import { useSessionInfoRegistry, type SessionInfoContext } from './session-info-registry'

// ── Types ──────────────────────────────────────────────

interface ConductorSession {
  name: string
  connected: boolean
  command: string
  cwd: string
}

/** A live session enriched with work-session + tab context */
interface EnrichedSession {
  session: ConductorSession
  workSession: WorkSession | null
  /** Ticket key derived from session name (t-NP3-14 → NP3-14) */
  ticketKey: string | null
  /** Whether an open tab is attached to this session */
  hasOpenTab: boolean
}

// ── Helpers ────────────────────────────────────────────

function ticketKeyFromSessionName(name: string): string | null {
  if (name.startsWith('t-')) return name.slice(2).toUpperCase()
  return null
}

/** Human-readable label for a session */
function sessionLabel(s: ConductorSession): string {
  const custom = getSessionTitle(s.name)
  if (custom) return custom
  const ticket = ticketKeyFromSessionName(s.name)
  if (ticket) return ticket
  if (s.name.startsWith('claude-code-') || s.name.startsWith('codex-')) return s.name
  const base = s.cwd.split('/').filter(Boolean).pop()
  return base ? `shell · ${base}` : s.name
}

const SORT_CYCLE: SessionSortOrder[] = ['none', 'created', 'alpha', 'attached']
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
    const posMap = new Map(groupSessionIds.map((id, i) => [id, i]))
    return [...sessions].sort((a, b) => (posMap.get(a.session.name) ?? 999) - (posMap.get(b.session.name) ?? 999))
  }
  if (order === 'none' || order === 'created') return sessions
  const sorted = [...sessions]
  if (order === 'alpha') {
    sorted.sort((a, b) => sessionLabel(a.session).localeCompare(sessionLabel(b.session)))
  } else if (order === 'attached') {
    sorted.sort((a, b) => (b.hasOpenTab ? 1 : 0) - (a.hasOpenTab ? 1 : 0))
  }
  return sorted
}

function buildTileTree(ids: string[], depth: number): LayoutNode {
  if (ids.length === 1) return { type: 'leaf', groupId: ids[0] }
  const containerType = depth % 2 === 0 ? 'row' : 'column'
  return {
    type: containerType,
    children: ids.map(id => ({
      node: { type: 'leaf' as const, groupId: id },
      size: 1,
    })),
  }
}

// ── Data hook ──────────────────────────────────────────

function useConductorSessions(intervalMs = 5_000) {
  const [sessions, setSessions] = useState<ConductorSession[]>([])
  const workSessions = useWorkSessionsStore(s => s.sessions)
  const groups = useTabsStore(s => s.groups)

  const refresh = useCallback(async () => {
    try {
      const list = await window.electronAPI.conductordGetSessions()
      const mapped: ConductorSession[] = list
        .filter((s: { dead: boolean }) => !s.dead)
        .map((s: { id: string; cwd: string; command: string }) => ({
          name: s.id,
          connected: true,
          command: s.command,
          cwd: s.cwd,
        }))
      setSessions(mapped)

      // Reconcile: prune references to sessions that no longer exist
      const liveNames = new Set(mapped.map(s => s.name))

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
        if (ws.status === 'active' && ws.sessionId && !liveNames.has(ws.sessionId)) {
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
    if (ws.sessionId) wsMap.set(ws.sessionId, ws)
  }

  const enriched: EnrichedSession[] = sessions
    .map(s => ({
      session: s,
      workSession: wsMap.get(s.name) ?? null,
      ticketKey: ticketKeyFromSessionName(s.name),
      hasOpenTab: openTabIds.has(s.name),
    }))

  const liveSessionNames = new Set(sessions.map(s => s.name))
  const orphanedWorkSessions = workSessions.filter(
    ws => ws.status === 'active' && ws.sessionId && !liveSessionNames.has(ws.sessionId)
  )

  return { enriched, orphanedWorkSessions, refresh, liveSessionNames }
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
      if (group.tabs.find(t => t.id === s.session.name)) {
        const newGid = tabsStore.createGroup()
        tabsStore.moveTab(gid, s.session.name, newGid)
        newGroupIds.push(newGid)
        break
      }
    }
  }
  if (newGroupIds.length === 0) return

  // Build a vertical stack for the tiled sessions
  const tileTree = buildTileTree(newGroupIds, 0)

  // Insert as a horizontal row: tiled group on the left, existing layout on the right
  layoutStore.setRoot({
    type: 'row',
    children: [
      { node: tileTree, size: 1 },
      { node: currentRoot, size: 1 },
    ],
  })
  layoutStore.setFocusedGroup(newGroupIds[0])
}

// ── Row components ─────────────────────────────────────

function getSessionTypeIcon(session: EnrichedSession): { Icon: React.ComponentType<{ className?: string }>; className: string } {
  const cmd = session.session.command.toLowerCase()
  if (cmd === 'claude' || session.session.name.startsWith('claude-code-'))
    return { Icon: Bot, className: 'text-orange-400' }
  if (cmd === 'codex' || session.session.name.startsWith('codex-'))
    return { Icon: Bot, className: 'text-emerald-400' }
  if (['zsh', 'bash', 'fish'].includes(cmd))
    return { Icon: Terminal, className: 'text-zinc-400' }
  return { Icon: Terminal, className: 'text-zinc-500' }
}

function SessionRow({
  session,
  isSelected,
  selectedIds,
  onRowClick,
  onDragStateChange,
  onKill,
}: {
  session: EnrichedSession
  isSelected: boolean
  selectedIds: Set<string>
  onRowClick: (name: string, e: React.MouseEvent) => void
  onDragStateChange: (dragging: boolean) => void
  onKill: () => void
}) {
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const groups = useTabsStore(s => s.groups)
  const claudeAccounts = useConfigStore(s => s.config.claudeAccounts)

  const [isExpanded, setIsExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const infoProviders = useSessionInfoRegistry(s => s.providers)

  const openTab = (() => {
    for (const [gid, group] of Object.entries(groups)) {
      const tab = group.tabs.find(t => t.id === session.session.name)
      if (tab) return { tab, groupId: gid }
    }
    return null
  })()

  const label = (openTab?.tab.title) || sessionLabel(session.session)
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
      setSessionTitle(session.session.name, title)
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
      id: session.session.name,
      type: 'claude-code',
      title: label,
      filePath: session.workSession?.worktree?.path || session.session.cwd,
    })
  }

  const status: { label: string; color: string } = isThinking
    ? { label: 'Thinking', color: 'text-blue-400' }
    : session.hasOpenTab
      ? { label: 'Idle', color: 'text-green-400' }
      : { label: 'Detached', color: 'text-amber-400' }

  const sessionType: { label: string; color: string } = (() => {
    const cmd = session.session.command.toLowerCase()
    if (cmd === 'claude' || session.session.name.startsWith('claude-code-'))
      return { label: 'Claude Code', color: 'text-orange-300' }
    if (cmd === 'codex' || session.session.name.startsWith('codex-'))
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
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>
      <div
        draggable
            onDoubleClick={openInTab}
            onClick={e => onRowClick(session.session.name, e)}
            onDragStart={e => {
              const names = isSelected && selectedIds.size > 1
                ? [...selectedIds]
                : [session.session.name]
              e.dataTransfer.setData('__dragging_session__', session.session.name)
              e.dataTransfer.setData('__dragging_sessions__', JSON.stringify(names))
              e.dataTransfer.effectAllowed = 'move'
              // Custom drag image
              const ghost = document.createElement('div')
              ghost.textContent = names.length > 1 ? `${names.length} sessions` : label
              ghost.style.cssText = 'position:fixed;top:-1000px;padding:4px 10px;border-radius:6px;background:#27272a;color:#e4e4e7;font-size:var(--ui-text-xs);font-weight:500;white-space:nowrap;border:1px solid #3f3f46;box-shadow:0 4px 12px rgba(0,0,0,0.4);'
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
            style={{ paddingLeft: '20px' }}
            className={`flex items-center gap-1 px-2 py-[3px] cursor-pointer select-none transition-colors text-ui-base ${
              isDragging
                ? 'opacity-30'
                : isSelected
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100'
            }`}
          >
            {isThinking ? (
              <span className="w-3.5 h-3.5 shrink-0 rounded-full border border-zinc-500 border-t-zinc-200 animate-spin flex-shrink-0" style={{ animationDuration: '1.5s' }} />
            ) : (() => { const { Icon, className } = getSessionTypeIcon(session); return <Icon className={`w-3.5 h-3.5 shrink-0 ${className}`} /> })()}

            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="flex-1 bg-zinc-700 text-zinc-100 px-1 text-ui-base outline-none border border-blue-500"
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
              <>
                <span className={`truncate flex-1 ${isThinking ? 'text-shimmer' : ''}`}>{label}</span>
                <span className="text-ui-xs shrink-0 ml-1.5 text-zinc-600">
                  {isThinking ? (thinkingTime || 'thinking') : ''}
                </span>
              </>
            )}

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
                <span className={`font-medium ${session.session.connected ? 'text-green-500' : 'text-zinc-500'}`}>
                  {session.session.connected ? 'active' : 'disconnected'}
                </span>
              </div>

              <div className="border-t border-zinc-700/30 pt-1.5 space-y-1">
                {/* Directory */}
                <div className="group/row flex items-center gap-1.5">
                  <Folder className="w-3 h-3 text-zinc-500 shrink-0" />
                  <span className="text-zinc-300 truncate flex-1">{session.session.cwd}</span>
                  <button onClick={e => copyToClipboard(session.session.cwd, e)} className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover/row:opacity-100">
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

                {/* Session name */}
                <div className="group/row flex items-center gap-1.5">
                  <Terminal className="w-3 h-3 text-zinc-500 shrink-0" />
                  <span className="text-zinc-400 truncate flex-1 font-mono">{session.session.name}</span>
                  <button onClick={e => copyToClipboard(session.session.name, e)} className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover/row:opacity-100">
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
                    <Bot className="w-3 h-3 text-red-400 shrink-0" />
                    <span className="text-red-400 font-medium">Autopilot</span>
                  </div>
                )}

                {/* API Key indicator */}
                {openTab?.tab.apiKey && (() => {
                  const account = claudeAccounts.find(a => a.apiKey === openTab.tab.apiKey)
                  if (!account) return null
                  return (
                    <div className="flex items-center gap-1.5">
                      <Key className="w-3 h-3 text-zinc-500 shrink-0" />
                      <span className="text-zinc-400">API Key: <span className="text-zinc-300">{account.name}</span></span>
                    </div>
                  )
                })()}

                {/* Extension-provided rows */}
                {infoProviders.map(p => {
                  const ctx: SessionInfoContext = {
                    sessionName: session.session.name,
                    cwd: session.session.cwd,
                    command: session.session.command,
                    connected: session.session.connected,
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
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44 bg-zinc-900 border-zinc-700">
        <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={startRename}>
          <Pencil className="w-3.5 h-3.5" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={() => setIsExpanded(!isExpanded)}>
          <Info className="w-3.5 h-3.5" />
          {isExpanded ? 'Hide info' : 'Info'}
        </ContextMenuItem>
        <ContextMenuSeparator className="bg-zinc-700" />
        <ContextMenuItem className="gap-2 text-xs cursor-pointer text-red-400 focus:text-red-300" onSelect={onKill}>
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </ContextMenuItem>
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
              <span className="text-ui-base font-medium text-zinc-400">{session.ticketKey}</span>
              <span className="text-ui-xs text-red-400/70">dead</span>
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
  onKillSession,
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
  onKillSession: (name: string) => void
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
      const beforeSession = sessions[insertIdx]?.session.name ?? null
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
      className={`transition-colors ${
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
      <div
        className="flex items-center gap-1 px-2 py-[3px] cursor-pointer select-none text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100 transition-colors group text-ui-base"
        onClick={() => setIsOpen(!isOpen)}
        onDoubleClick={group ? e => { e.stopPropagation(); startRename() } : undefined}
      >
        <span className="text-zinc-500 shrink-0">
          {isOpen
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />
          }
        </span>
        {isOpen
          ? <FolderOpen className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
          : <Folder className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
        }

        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="flex-1 bg-zinc-700 text-zinc-100 px-1 text-ui-base outline-none border border-blue-500"
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
          <span className="flex-1 min-w-0 truncate">{label}</span>
        )}

        <span className="text-ui-xs text-zinc-600 shrink-0">{sessions.length}</span>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {canTile && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={e => { e.stopPropagation(); tileSessions(attachedInGroup) }}
                  className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
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
                    onClick={e => { e.stopPropagation(); startRename() }}
                    className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Rename group</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete() }}
                    className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors"
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
              <React.Fragment key={s.session.name}>
                {dropInsertIdx === i && (
                  <div className="mx-1 h-0.5 bg-indigo-400 rounded-full my-0.5" />
                )}
                <div data-session-row>
                  <SessionRow
                    session={s}
                    isSelected={selectedIds.has(s.session.name)}
                    selectedIds={selectedIds}
                    onRowClick={onRowClick}
                    onDragStateChange={onDragStateChange}
                    onKill={() => onKillSession(s.session.name)}
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
  const { enriched, orphanedWorkSessions, refresh } = useConductorSessions()
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
    const gid = sessionToGroup.get(s.session.name)
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
    for (const s of (groupedSessions.get(group.id) || [])) flatSessionOrder.push(s.session.name)
  }
  for (const s of ungrouped) flatSessionOrder.push(s.session.name)

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

  async function handleKillSession(name: string) {
    const sessionsStore = useWorkSessionsStore.getState()
    const tabsState = useTabsStore.getState()
    const projectState = useProjectStore.getState()

    await window.electronAPI.killTerminal(name)
    clearSessionTitle(name)
    clearSessionAutoPilot(name)

    const match = enriched.find(s => s.session.name === name)
    if (match?.workSession?.status === 'active') {
      await sessionsStore.completeSession(match.workSession.id)
    }

    const gid = sessionToGroup.get(name)
    if (gid) projectState.removeSessionFromGroup(gid, name)

    for (const [tabGroupId, group] of Object.entries(tabsState.groups)) {
      if (group.tabs.some(t => t.id === name)) {
        tabsState.removeTab(tabGroupId, name)
        break
      }
    }

    setSelectedIds(prev => { const next = new Set(prev); next.delete(name); return next })
    refresh()
  }

  async function killSelected() {
    const sessionsStore = useWorkSessionsStore.getState()
    const tabsState = useTabsStore.getState()
    const projectState = useProjectStore.getState()

    for (const name of selectedIds) {
      await window.electronAPI.killTerminal(name)
      clearSessionTitle(name)
      clearSessionAutoPilot(name)

      // Complete associated work session
      const match = enriched.find(s => s.session.name === name)
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
      <ContextMenu>
      <ContextMenuTrigger asChild>
      <div className="min-h-full">
        {/* Sort toolbar */}
        <div className="px-2 py-1 mb-1 border-b border-zinc-700/50 pb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-ui-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                <SortIcon className="w-3 h-3" />
                <span>Sort: {SORT_LABELS[sessionSort]}</span>
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-zinc-900 border-zinc-700" align="start">
              {SORT_CYCLE.map(order => {
                const Icon = SORT_ICONS[order]
                const isActive = order === sessionSort
                return (
                  <DropdownMenuItem
                    key={order}
                    className={`gap-2 text-ui-base cursor-pointer ${isActive ? 'bg-zinc-700 text-white' : ''}`}
                    onSelect={() => useProjectStore.getState().setSessionSort(order)}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {SORT_LABELS[order]}
                  </DropdownMenuItem>
                )
              })}
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
              onKillSession={handleKillSession}
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
          onKillSession={handleKillSession}
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

      </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44 bg-zinc-900 border-zinc-700">
        <ContextMenuItem
          className="gap-2 text-xs cursor-pointer"
          onSelect={() => useProjectStore.getState().addSessionGroup('New Group', [])}
        >
          <FolderPlus className="w-3.5 h-3.5" />
          New folder
        </ContextMenuItem>
      </ContextMenuContent>
      </ContextMenu>
    </SidebarLayout>
  )
}
