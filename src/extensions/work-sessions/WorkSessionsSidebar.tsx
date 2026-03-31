import React, { useCallback, useEffect, useRef, useState } from 'react'
import { GitBranch, Square, Trash2 } from 'lucide-react'
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
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'
import { useWorkSessionsStore } from '@/store/work-sessions'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
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
  // Jira-originated: t-NP3-14 → NP3-14
  const ticket = ticketKeyFromTmuxName(tmux.name)
  if (ticket) return ticket
  // Named AI CLI sessions: claude-code-1, codex-1, etc.
  if (tmux.name.startsWith('claude-code-') || tmux.name.startsWith('codex-')) return tmux.name
  // Fallback: use the cwd basename
  const base = tmux.cwd.split('/').filter(Boolean).pop()
  return base ? `shell · ${base}` : tmux.name
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
    } catch {
      setSessions([])
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [refresh, intervalMs])

  // Build a set of tmux names that have an open tab
  const openTabIds = new Set<string>()
  for (const group of Object.values(groups)) {
    for (const tab of group.tabs) {
      openTabIds.add(tab.id)
    }
  }

  // Build a map of tmuxSessionId → WorkSession for fast lookup
  const wsMap = new Map<string, WorkSession>()
  for (const ws of workSessions) {
    if (ws.tmuxSessionId) wsMap.set(ws.tmuxSessionId, ws)
  }

  // Enrich tmux sessions
  const enriched: EnrichedSession[] = sessions
    .sort((a, b) => b.activity - a.activity)
    .map(tmux => ({
      tmux,
      workSession: wsMap.get(tmux.name) ?? null,
      ticketKey: ticketKeyFromTmuxName(tmux.name),
      hasOpenTab: openTabIds.has(tmux.name),
    }))

  // Find orphaned work sessions (tmux died but record is still active)
  const liveTmuxNames = new Set(sessions.map(s => s.name))
  const orphanedWorkSessions = workSessions.filter(
    ws => ws.status === 'active' && ws.tmuxSessionId && !liveTmuxNames.has(ws.tmuxSessionId)
  )

  return { enriched, orphanedWorkSessions, refresh, liveTmuxNames }
}

// ── Row components ─────────────────────────────────────

function TmuxRow({
  session,
  onAction,
}: {
  session: EnrichedSession
  onAction: () => void
}) {
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const sessionsStore = useWorkSessionsStore.getState()
  const groups = useTabsStore(s => s.groups)

  // Find open tab and its group for rename/title support
  const openTab = (() => {
    for (const [gid, group] of Object.entries(groups)) {
      const tab = group.tabs.find(t => t.id === session.tmux.name)
      if (tab) return { tab, groupId: gid }
    }
    return null
  })()

  const label = openTab ? openTab.tab.title : sessionLabel(session.tmux)
  const isOrphan = !session.workSession

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
    if (openTab && renameValue.trim()) {
      useTabsStore.getState().updateTab(openTab.groupId, openTab.tab.id, { title: renameValue.trim() })
    }
    setIsRenaming(false)
  }

  const openInTab = () => {
    // Focus existing tab if already open
    if (openTab) {
      useTabsStore.getState().setActiveTab(openTab.groupId, openTab.tab.id)
      useLayoutStore.getState().setFocusedGroup(openTab.groupId)
      return
    }
    const allGroups = useTabsStore.getState().groups
    const targetGroup = focusedGroupId || Object.keys(allGroups)[0]
    if (targetGroup) {
      addTab(targetGroup, {
        id: session.tmux.name,
        type: 'claude-code',
        title: `Claude Code · ${label}`,
        filePath: session.workSession?.worktree?.path || session.tmux.cwd,
      })
    }
  }

  const killTmux = async () => {
    await window.electronAPI.conductordKillTmuxSession(session.tmux.name)
    // Also complete the work session if there is one
    if (session.workSession && session.workSession.status === 'active') {
      await sessionsStore.completeSession(session.workSession.id)
    }
    onAction()
  }

  const deleteSession = async () => {
    await window.electronAPI.conductordKillTmuxSession(session.tmux.name)
    if (session.workSession) {
      await sessionsStore.deleteSession(session.workSession.id)
    }
    onAction()
  }

  const secondaryInfo = session.workSession?.worktree?.branch
    || session.tmux.cwd.replace(/^\/Users\/[^/]+/, '~')

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="flex items-center gap-1.5 rounded px-2 py-1.5 hover:bg-zinc-800/50 transition-colors">
          {/* Status dot */}
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            session.hasOpenTab ? 'bg-green-400 animate-pulse' : 'bg-amber-400'
          }`} />

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
            <button onClick={openInTab} className="min-w-0 flex-1 text-left">
              <span
                className="text-xs font-medium text-zinc-300 truncate block"
                onDoubleClick={e => { if (openTab) { e.stopPropagation(); startRename() } }}
              >
                {label}
              </span>
              <span className="text-[10px] text-zinc-600 truncate block">{secondaryInfo}</span>
            </button>
          )}

          {/* Time */}
          <span className="text-[10px] text-zinc-600 shrink-0">{relativeTime(session.tmux.activity)}</span>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => { e.stopPropagation(); killTmux() }}
                className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
              >
                <Square className="w-3 h-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Kill session</TooltipContent>
          </Tooltip>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {openTab && (
          <>
            <ContextMenuItem onSelect={startRename}>
              Rename
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={killTmux} className="text-amber-400">
          <Square className="w-3 h-3 mr-2" />
          Kill session
        </ContextMenuItem>
        {session.workSession && (
          <ContextMenuItem onSelect={deleteSession} className="text-red-400">
            <Trash2 className="w-3 h-3 mr-2" />
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
      <ContextMenuContent>
        <ContextMenuItem onSelect={handleComplete}>
          <Square className="w-3 h-3 mr-2" />
          Mark completed
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleDelete} className="text-red-400">
          <Trash2 className="w-3 h-3 mr-2" />
          Delete record
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ── Main component ─────────────────────────────────────

export default function WorkSessionsSidebar({ groupId }: { groupId: string }): React.ReactElement {
  const { enriched, orphanedWorkSessions, refresh } = useTmuxSessions()

  const subtitle = enriched.length > 0
    ? `${enriched.length} live`
    : undefined

  return (
    <SidebarLayout
      title="Sessions"
      subtitle={subtitle}
    >
      <div className="p-1">
        {enriched.length === 0 && orphanedWorkSessions.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-600">
            No tmux sessions running.
          </div>
        ) : (
          <>
            {enriched.length > 0 && (
              <div className="mb-3">
                <div className="px-2 mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                  Live
                </div>
                {enriched.map(s => (
                  <TmuxRow key={s.tmux.name} session={s} onAction={refresh} />
                ))}
              </div>
            )}
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
      </div>
    </SidebarLayout>
  )
}
