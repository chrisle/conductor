import { memo, useState } from 'react'
import { Bug, Bookmark, CircleCheck, ChevronDown, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { LinkContextMenu } from '@/components/ui/link-context-menu'
import type { Ticket, JiraConfig } from './jira-api'
import { transitionTicket } from './jira-api'

interface TicketCardProps {
  ticket: Ticket
  config: JiraConfig
  jiraBaseUrl: string
  onOpenUrl: (url: string, title: string) => void
  onOpenClaude: (ticket: Ticket) => void
  onBeginWork: (ticket: Ticket) => void
  onRefresh: () => void
}

export const TicketCard = memo(function TicketCard({
  ticket,
  config,
  jiraBaseUrl,
  onOpenUrl,
  onOpenClaude,
  onBeginWork,
  onRefresh,
}: TicketCardProps) {
  const [jiraLoading, setJiraLoading] = useState(false)

  const hasPRs = ticket.pullRequests.length > 0

  const cardClasses = hasPRs
    ? 'border-emerald-600/60 bg-emerald-950/30 hover:border-emerald-500/70'
    : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'

  const handleTransition = async (status: string) => {
    setJiraLoading(true)
    try {
      await transitionTicket(config, ticket.key, status)
      // Wait a moment for Jira to settle, then refresh
      await new Promise((r) => setTimeout(r, 500))
      onRefresh()
    } catch (err) {
      console.error('Failed to transition ticket:', err)
    } finally {
      setJiraLoading(false)
    }
  }

  return (
    <div className={`relative rounded-lg border p-3 transition-colors ${cardClasses}`}>
      {/* Header: Key + PRs + Story Points */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {ticket.issueType?.toLowerCase() === 'bug' ? (
            <Bug className="h-3.5 w-3.5 shrink-0 text-red-500" />
          ) : ticket.issueType?.toLowerCase() === 'story' ? (
            <Bookmark className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          ) : (
            <CircleCheck className="h-3.5 w-3.5 shrink-0 text-blue-500" />
          )}
          <LinkContextMenu url={`${jiraBaseUrl}/browse/${ticket.key}`} title={ticket.key}>
            <button
              onClick={() => onOpenUrl(`${jiraBaseUrl}/browse/${ticket.key}`, ticket.key)}
              className="shrink-0 text-xs font-medium text-zinc-500 hover:text-violet-400"
            >
              {ticket.key}
            </button>
          </LinkContextMenu>
          {ticket.pullRequests.map((pr) => {
            const isMerged = pr.status === 'MERGED'
            const prNum = pr.url.match(/\/pull\/(\d+)/)?.[1]
            return (
              <LinkContextMenu key={pr.id} url={pr.url} title={`PR #${prNum}`}>
                <Badge
                  variant="secondary"
                  className={`cursor-pointer text-[10px] ${
                    isMerged
                      ? 'bg-emerald-900/50 text-emerald-400 hover:bg-emerald-800/50 hover:text-emerald-300'
                      : 'bg-blue-900/50 text-blue-400 hover:bg-blue-800/50 hover:text-blue-300'
                  }`}
                  onClick={() => onOpenUrl(pr.url, `PR #${prNum}`)}
                >
                  PR#{prNum}
                </Badge>
              </LinkContextMenu>
            )
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {ticket.storyPoints != null && (
            <Badge variant="secondary" className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 px-0 text-[10px] text-zinc-400">
              {ticket.storyPoints}
            </Badge>
          )}
        </div>
      </div>

      {/* Summary */}
      <p className="mb-2 text-sm leading-snug text-zinc-200">{ticket.summary}</p>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        {/* Worktree dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="h-6 bg-zinc-800/80 text-[11px] text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 border border-zinc-700/50 px-2"
            >
              Worktree
              <ChevronDown className="h-3 w-3 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
            <DropdownMenuItem onSelect={() => onOpenClaude(ticket)}>
              Open in Claude
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onBeginWork(ticket)}>
              Begin work in Claude
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Jira dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              disabled={jiraLoading}
              className="h-6 bg-zinc-800/80 text-[11px] text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 border border-zinc-700/50 px-2"
            >
              {jiraLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Jira
              {!jiraLoading && <ChevronDown className="h-3 w-3 ml-0.5" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
            <DropdownMenuItem onSelect={() => handleTransition('In Progress')}>
              In Progress
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleTransition('Done')}>
              Done
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Code dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="h-6 bg-zinc-800/80 text-[11px] text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 border border-zinc-700/50 px-2"
            >
              Code
              <ChevronDown className="h-3 w-3 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
            <DropdownMenuItem onSelect={() => onOpenUrl(
              `${jiraBaseUrl}/browse/${ticket.key}`,
              ticket.key
            )}>
              Open in Jira
            </DropdownMenuItem>
            {ticket.pullRequests.filter(pr => pr.status === 'OPEN').map((pr) => (
              <DropdownMenuItem key={pr.id} onSelect={() => onOpenUrl(pr.url, pr.name)}>
                Open PR #{pr.url.match(/\/pull\/(\d+)/)?.[1]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
})
