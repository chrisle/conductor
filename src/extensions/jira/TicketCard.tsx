import { memo, useState } from 'react'
import { Bug, Bookmark, CircleCheck, ChevronDown, Loader2, GitBranch } from 'lucide-react'
import ClaudeIcon from '@/components/ui/ClaudeIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { LinkContextMenu } from '@/components/ui/link-context-menu'
import { useWorkSessionsStore } from '@/store/work-sessions'
import type { Ticket, JiraConfig } from './jira-api'
import { transitionTicket } from './jira-api'
import type { WorkSession } from '@/types/work-session'

interface TicketCardProps {
  ticket: Ticket
  config: JiraConfig
  jiraBaseUrl: string
  isThinking: boolean
  workSession?: WorkSession
  onOpenUrl: (url: string, title: string) => void
  onNewSession: (ticket: Ticket) => void
  onContinueSession: (ticket: Ticket) => void
  onStartWork: (ticket: Ticket) => void
  onRefresh: () => void
}

export const TicketCard = memo(function TicketCard({
  ticket,
  config,
  jiraBaseUrl,
  isThinking,
  workSession,
  onOpenUrl,
  onNewSession,
  onContinueSession,
  onStartWork,
  onRefresh,
}: TicketCardProps) {
  const [jiraLoading, setJiraLoading] = useState(false)

  const hasPRs = ticket.pullRequests.length > 0
  const sessionActive = workSession?.status === 'active'

  const cardClasses = hasPRs
    ? 'border-emerald-600/60 bg-emerald-950/30 hover:border-emerald-500/70'
    : sessionActive
      ? 'border-blue-700/50 bg-blue-950/30 hover:border-blue-600/60'
      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'

  const handleTransition = async (status: string) => {
    setJiraLoading(true)
    try {
      await transitionTicket(config, ticket.key, status)
      // If completing via Jira "Done", also complete the work session
      if (status === 'Done' && workSession) {
        await useWorkSessionsStore.getState().completeSession(workSession.id)
      }
      await new Promise((r) => setTimeout(r, 500))
      onRefresh()
    } catch (err) {
      console.error('Failed to transition ticket:', err)
    } finally {
      setJiraLoading(false)
    }
  }

  return (
    <div className={`relative rounded-lg border p-3 transition-colors ${cardClasses}${isThinking ? ' thinking-halo' : ''}`}>
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
          {/* Session status dot */}
          {sessionActive && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"
              title="Active"
            />
          )}
          {ticket.storyPoints != null && (
            <Badge variant="secondary" className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 px-0 text-[10px] text-zinc-400">
              {ticket.storyPoints}
            </Badge>
          )}
        </div>
      </div>

      {/* Summary */}
      <p className="mb-2 text-sm leading-snug text-zinc-200">{ticket.summary}</p>

      {/* Work session info */}
      {workSession?.worktree?.branch && (
        <div className="mb-2 flex items-center gap-1.5">
          <Badge variant="outline" className="h-4 px-1.5 gap-0.5 text-[10px] text-fuchsia-400 border-fuchsia-900/50 bg-fuchsia-950/20">
            <GitBranch className="w-2.5 h-2.5" />
            {workSession.worktree.branch}
          </Badge>
          {workSession.prUrl && (
            <LinkContextMenu url={workSession.prUrl} title="PR">
              <Badge
                variant="secondary"
                className="cursor-pointer text-[10px] bg-blue-900/50 text-blue-400 hover:bg-blue-800/50"
                onClick={() => onOpenUrl(workSession.prUrl!, 'PR')}
              >
                PR
              </Badge>
            </LinkContextMenu>
          )}
        </div>
      )}

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
            {sessionActive && (
              <DropdownMenuItem onSelect={() => onContinueSession(ticket)}>
                <ClaudeIcon className="w-3 h-3 text-[#D97757]" />
                Continue session
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onNewSession(ticket)}>
              <ClaudeIcon className="w-3 h-3 text-[#D97757]" />
              New session
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onStartWork(ticket)}>
              <ClaudeIcon className="w-3 h-3 text-[#D97757]" />
              Start work
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
