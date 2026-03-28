import React from 'react'
import { Play, Pause, CheckCircle, Trash2, GitBranch } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'
import { useWorkSessionsStore } from '@/store/work-sessions'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import type { WorkSession } from '@/types/work-session'

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function SessionRow({ session }: { session: WorkSession }) {
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const store = useWorkSessionsStore.getState()

  const statusDot = session.status === 'active'
    ? 'bg-green-400 animate-pulse'
    : session.status === 'paused'
      ? 'bg-amber-400'
      : 'bg-zinc-500'

  const handleClick = () => {
    // Try to find existing tab by tmux session ID
    const groups = useTabsStore.getState().groups
    for (const [groupId, group] of Object.entries(groups)) {
      const tab = group.tabs.find(t => t.id === session.tmuxSessionId)
      if (tab) {
        useTabsStore.getState().setActiveTab(groupId, tab.id)
        useLayoutStore.getState().setFocusedGroup(groupId)
        return
      }
    }
    // No existing tab — create one
    const targetGroup = focusedGroupId || Object.keys(groups)[0]
    if (targetGroup) {
      addTab(targetGroup, {
        id: session.tmuxSessionId || undefined,
        type: 'claude',
        title: `Claude · ${session.ticketKey}`,
        filePath: session.worktree?.path,
      })
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <button
          onClick={handleClick}
          className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-zinc-800/50 transition-colors"
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-zinc-300">{session.ticketKey}</span>
              <span className="text-[10px] text-zinc-600">{relativeTime(session.updatedAt)}</span>
            </div>
            {session.worktree?.branch && (
              <div className="flex items-center gap-1 mt-0.5">
                <GitBranch className="w-2.5 h-2.5 text-zinc-600" />
                <span className="text-[10px] text-zinc-500 truncate">{session.worktree.branch}</span>
              </div>
            )}
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {session.status === 'paused' && (
          <ContextMenuItem onSelect={() => store.updateSession(session.id, { status: 'active' })}>
            <Play className="w-3 h-3 mr-2 text-green-400" />
            Resume
          </ContextMenuItem>
        )}
        {session.status === 'active' && (
          <ContextMenuItem onSelect={() => store.pauseSession(session.id)}>
            <Pause className="w-3 h-3 mr-2 text-amber-400" />
            Pause
          </ContextMenuItem>
        )}
        {session.status !== 'completed' && (
          <ContextMenuItem onSelect={() => store.completeSession(session.id)}>
            <CheckCircle className="w-3 h-3 mr-2 text-emerald-400" />
            Complete
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={() => store.deleteSession(session.id)} className="text-red-400">
          <Trash2 className="w-3 h-3 mr-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function SessionGroup({ title, sessions }: { title: string; sessions: WorkSession[] }) {
  if (sessions.length === 0) return null
  return (
    <div className="mb-3">
      <div className="px-2 mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
        {title}
      </div>
      {sessions.map(session => (
        <SessionRow key={session.id} session={session} />
      ))}
    </div>
  )
}

export default function WorkSessionsSidebar({ groupId }: { groupId: string }): React.ReactElement {
  const sessions = useWorkSessionsStore(s => s.sessions)

  const active = sessions.filter(s => s.status === 'active')
  const paused = sessions.filter(s => s.status === 'paused')
  const completed = sessions.filter(s => s.status === 'completed').slice(0, 10)

  const total = active.length + paused.length

  return (
    <SidebarLayout
      title="Sessions"
      subtitle={total > 0 ? `${total} active` : undefined}
    >
      <div className="p-1">
        {active.length === 0 && paused.length === 0 && completed.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-600">
            No work sessions yet. Start work on a ticket from the Jira board.
          </div>
        ) : (
          <>
            <SessionGroup title="Active" sessions={active} />
            <SessionGroup title="Paused" sessions={paused} />
            <SessionGroup title="Completed" sessions={completed} />
          </>
        )}
      </div>
    </SidebarLayout>
  )
}
