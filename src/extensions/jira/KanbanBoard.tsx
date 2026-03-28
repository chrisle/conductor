import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { KanbanColumn } from './KanbanColumn'
import type { PendingTicket } from './KanbanColumn'
import type { Ticket, Epic, TicketStatus, JiraConfig } from './jira-api'
import type { ThinkingState } from '@/lib/terminal-detection'

const COLUMNS: { title: string; status: TicketStatus }[] = [
  { title: 'Backlog', status: 'backlog' },
  { title: 'In Progress', status: 'in_progress' },
  { title: 'Done', status: 'done' },
]

interface KanbanBoardProps {
  tickets: Ticket[]
  epics: Epic[]
  config: JiraConfig
  jiraBaseUrl: string
  pendingTickets?: PendingTicket[]
  tmuxSessions: Set<string>
  sessionThinking: Record<string, ThinkingState>
  onOpenUrl: (url: string, title: string) => void
  onNewSession: (ticket: Ticket) => void
  onContinueSession: (ticket: Ticket) => void
  onStartWork: (ticket: Ticket) => void
  onRefresh: () => void
  onCreateTicket?: (status: TicketStatus, epicKey: string | null) => void
}

export function KanbanBoard({ tickets, epics, config, jiraBaseUrl, pendingTickets = [], tmuxSessions, sessionThinking, onOpenUrl, onNewSession, onContinueSession, onStartWork, onRefresh, onCreateTicket }: KanbanBoardProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const epicKeys = epics.map((e) => e.key)
  const ungroupedTickets = tickets.filter((t) => !t.epicKey || !epicKeys.includes(t.epicKey))

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const columnProps = { config, jiraBaseUrl, tmuxSessions, sessionThinking, onOpenUrl, onNewSession, onContinueSession, onStartWork, onRefresh }

  return (
    <div className="h-full overflow-auto p-4 space-y-6 min-w-0">
      {epics.map((epic) => {
        const epicTickets = tickets.filter((t) => t.epicKey === epic.key)
        if (epicTickets.length === 0 && !pendingTickets.some(p => p.epicKey === epic.key)) return null

        const isCollapsed = collapsed.has(epic.key)
        const counts = COLUMNS.map((col) => epicTickets.filter((t) => t.status === col.status).length)
        const epicPending = pendingTickets.filter(p => p.epicKey === epic.key)

        return (
          <Collapsible key={epic.key} open={!isCollapsed} onOpenChange={() => toggle(epic.key)} asChild>
            <section>
              <CollapsibleTrigger className="mb-3 flex w-full items-center gap-2 text-left">
                {isCollapsed
                  ? <ChevronRight className="h-4 w-4 text-zinc-500" />
                  : <ChevronDown className="h-4 w-4 text-zinc-500" />
                }
                <h2 className="text-sm font-semibold text-zinc-200">{epic.summary}</h2>
                <span className="text-xs text-zinc-600">{epic.key}</span>
                <div className="ml-auto flex gap-2">
                  {COLUMNS.map((col, i) => (
                    counts[i] > 0 && (
                      <Badge key={col.status} variant="secondary" className="rounded bg-zinc-800 text-[10px] text-zinc-500">
                        {col.title} {counts[i]}
                      </Badge>
                    )
                  ))}
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className={`grid gap-4`} style={{ gridTemplateColumns: 'repeat(3, minmax(280px, 1fr))' }}>
                  {COLUMNS.map((col) => (
                    <KanbanColumn
                      key={col.status}
                      title={col.title}
                      status={col.status}
                      tickets={epicTickets}
                      pendingTickets={epicPending}
                      onCreateTicket={onCreateTicket ? (status) => onCreateTicket(status, epic.key) : undefined}
                      {...columnProps}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </section>
          </Collapsible>
        )
      })}

      {(ungroupedTickets.length > 0 || pendingTickets.some(p => !p.epicKey)) && (
        <Collapsible open={!collapsed.has('__ungrouped')} onOpenChange={() => toggle('__ungrouped')} asChild>
          <section>
            <CollapsibleTrigger className="mb-3 flex w-full items-center gap-2 text-left">
              {collapsed.has('__ungrouped')
                ? <ChevronRight className="h-4 w-4 text-zinc-500" />
                : <ChevronDown className="h-4 w-4 text-zinc-500" />
              }
              <h2 className="text-sm font-semibold text-zinc-200">Ungrouped</h2>
              <div className="ml-auto flex gap-2">
                {COLUMNS.map((col) => {
                  const count = ungroupedTickets.filter((t) => t.status === col.status).length
                  return count > 0 && (
                    <Badge key={col.status} variant="secondary" className="rounded bg-zinc-800 text-[10px] text-zinc-500">
                      {col.title} {count}
                    </Badge>
                  )
                })}
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className={`grid grid-cols-3 gap-4`}>
                {COLUMNS.map((col) => (
                  <KanbanColumn
                    key={col.status}
                    title={col.title}
                    status={col.status}
                    tickets={ungroupedTickets}
                    pendingTickets={pendingTickets.filter(p => !p.epicKey)}
                    onCreateTicket={onCreateTicket ? (status) => onCreateTicket(status, null) : undefined}
                    {...columnProps}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </section>
        </Collapsible>
      )}
    </div>
  )
}
