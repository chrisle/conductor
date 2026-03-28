import { useState, useMemo } from 'react'
import { ArrowUpDown, Plus, Minimize2, Maximize2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { TicketCard } from './TicketCard'
import { LinkContextMenu } from '@/components/ui/link-context-menu'
import type { Ticket, TicketStatus, JiraConfig } from './jira-api'
import type { ThinkingState } from '@/lib/terminal-detection'

type SortMode = 'none' | 'modified_desc' | 'modified_asc'

export interface PendingTicket {
  tempId: string
  status: TicketStatus
  epicKey: string | null
}

interface KanbanColumnProps {
  title: string
  status: TicketStatus
  tickets: Ticket[]
  pendingTickets?: PendingTicket[]
  config: JiraConfig
  jiraBaseUrl: string
  tmuxSessions: Set<string>
  sessionThinking: Record<string, ThinkingState>
  onOpenUrl: (url: string, title: string) => void
  onNewSession: (ticket: Ticket) => void
  onContinueSession: (ticket: Ticket) => void
  onStartWork: (ticket: Ticket) => void
  onRefresh: () => void
  onCreateTicket?: (status: TicketStatus) => void
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  backlog: 'text-zinc-400',
  in_progress: 'text-blue-400',
  done: 'text-emerald-400',
}

const SORT_LABELS: Record<SortMode, string> = {
  none: 'Default',
  modified_desc: 'Modified (Newest)',
  modified_asc: 'Modified (Oldest)',
}

const COMPACT_KEY = 'conductor:jira:compact'

function loadCompact(): Set<string> {
  try {
    const raw = localStorage.getItem(COMPACT_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set(['done'])
  } catch {
    return new Set(['done'])
  }
}

function saveCompact(set: Set<string>) {
  localStorage.setItem(COMPACT_KEY, JSON.stringify([...set]))
}

export function KanbanColumn({ title, status, tickets, pendingTickets = [], config, jiraBaseUrl, tmuxSessions, sessionThinking, onOpenUrl, onNewSession, onContinueSession, onStartWork, onRefresh, onCreateTicket }: KanbanColumnProps) {
  const [sort, setSort] = useState<SortMode>('none')
  const [compact, setCompact] = useState(() => loadCompact().has(status))

  const toggleCompact = () => {
    const next = !compact
    setCompact(next)
    const set = loadCompact()
    if (next) set.add(status); else set.delete(status)
    saveCompact(set)
  }

  const columnTickets = useMemo(() => {
    const filtered = tickets.filter((t) => t.status === status)
    if (sort === 'none') return filtered
    const dir = sort === 'modified_asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const aTime = new Date(a.updatedAt).getTime()
      const bTime = new Date(b.updatedAt).getTime()
      return (aTime - bTime) * dir
    })
  }, [tickets, status, sort])

  const columnPending = pendingTickets.filter((p) => p.status === status)

  return (
    <div className="flex flex-col rounded-xl bg-zinc-900/40 p-3 border border-zinc-800/50">
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <h2 className={`text-sm font-semibold ${STATUS_COLORS[status]}`}>{title}</h2>
        <Badge variant="secondary" className="rounded-full bg-zinc-800 text-zinc-400">
          {columnTickets.length}
        </Badge>

        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-zinc-800 ${
                  sort !== 'none' ? 'text-violet-400' : 'text-zinc-600'
                }`}
              >
              <ArrowUpDown className="h-3 w-3" />
              {sort !== 'none' && SORT_LABELS[sort]}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end">
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <DropdownMenuItem
                key={mode}
                onSelect={() => setSort(mode)}
                className={sort === mode ? 'text-violet-400' : ''}
              >
                {SORT_LABELS[mode]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={toggleCompact}
            className="flex items-center justify-center rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-400"
            title={compact ? 'Expand' : 'Shrink'}
          >
            {compact ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
          </button>

          {onCreateTicket && (
            <button
              onClick={() => onCreateTicket(status)}
              className="flex items-center justify-center rounded p-1 bg-violet-600/20 text-violet-400 transition-colors hover:bg-violet-600/40 hover:text-violet-300"
              title="New ticket"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto px-2 -mx-2 ${compact ? 'space-y-0.5' : 'space-y-2'}`}>
        {compact ? (
          columnTickets.map((ticket) => {
            const prNum = ticket.pullRequests[0]?.url.match(/\/pull\/(\d+)/)?.[1]
            const prUrl = ticket.pullRequests[0]?.url
            const isMerged = ticket.pullRequests[0]?.status === 'MERGED'
            return (
              <div key={ticket.key} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-zinc-800/50">
                <LinkContextMenu url={`${jiraBaseUrl}/browse/${ticket.key}`} title={ticket.key}>
                  <button
                    onClick={() => onOpenUrl(`${jiraBaseUrl}/browse/${ticket.key}`, ticket.key)}
                    className="shrink-0 text-xs font-medium text-zinc-500 hover:text-violet-400"
                  >
                    {ticket.key}
                  </button>
                </LinkContextMenu>
                <span className="min-w-0 truncate text-xs text-zinc-400">{ticket.summary}</span>
                {prNum && prUrl && (
                  <LinkContextMenu url={prUrl} title={`PR #${prNum}`}>
                    <Badge
                      variant="secondary"
                      className={`ml-auto shrink-0 cursor-pointer text-[10px] ${
                        isMerged
                          ? 'bg-emerald-900/50 text-emerald-400 hover:bg-emerald-800/50 hover:text-emerald-300'
                          : 'bg-blue-900/50 text-blue-400 hover:bg-blue-800/50 hover:text-blue-300'
                      }`}
                      onClick={() => onOpenUrl(prUrl, `PR #${prNum}`)}
                    >
                      PR#{prNum}
                    </Badge>
                  </LinkContextMenu>
                )}
              </div>
            )
          })
        ) : (
          <>
            {columnTickets.map((ticket) => (
              <TicketCard
                key={ticket.key}
                ticket={ticket}
                config={config}
                jiraBaseUrl={jiraBaseUrl}
                hasSession={tmuxSessions.has(`t-${ticket.key}`)}
                isThinking={sessionThinking[`t-${ticket.key}`]?.thinking ?? false}
                onOpenUrl={onOpenUrl}
                onNewSession={onNewSession}
                onContinueSession={onContinueSession}
                onStartWork={onStartWork}
                onRefresh={onRefresh}
              />
            ))}
            {columnPending.map((p) => (
              <div key={p.tempId} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3.5 w-3.5 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-1.5 pt-1">
                  <Skeleton className="h-6 w-14 rounded" />
                  <Skeleton className="h-6 w-10 rounded" />
                </div>
              </div>
            ))}
          </>
        )}
        {columnTickets.length === 0 && columnPending.length === 0 && (
          <p className="py-8 text-center text-xs text-zinc-600">No tickets</p>
        )}
      </div>
    </div>
  )
}
