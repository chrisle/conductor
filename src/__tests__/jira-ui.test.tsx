import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TicketCard } from '@np3/jira/TicketCard'
import { KanbanColumn } from '@np3/jira/KanbanColumn'
import type { Ticket, JiraConfig } from '@np3/jira/jira-api'

// Mock the extension-api ui components used by TicketCard and KanbanColumn
vi.mock('@conductor/extension-api', () => ({
  useWorkSessionsStore: { getState: () => ({ completeSession: vi.fn() }) },
  useConfigStore: {
    getState: () => ({
      config: { ui: { kanbanCompactColumns: [] } },
      setKanbanCompactColumns: vi.fn(),
    }),
  },
  ui: {
    ClaudeIcon: (props: any) => <span data-testid="claude-icon" {...props} />,
    Badge: ({ children, className, ...rest }: any) => (
      <span data-testid="badge" className={className} {...rest}>{children}</span>
    ),
    Button: ({ children, className, ...rest }: any) => (
      <button data-testid="button" className={className} {...rest}>{children}</button>
    ),
    DropdownMenu: ({ children }: any) => <div data-testid="dropdown-menu">{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div data-testid="dropdown-trigger">{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div data-testid="dropdown-content">{children}</div>,
    DropdownMenuItem: ({ children, onSelect }: any) => (
      <div data-testid="dropdown-item" onClick={onSelect}>{children}</div>
    ),
    DropdownMenuSeparator: () => <hr />,
    LinkContextMenu: ({ children }: any) => <>{children}</>,
    Skeleton: ({ className }: any) => <div data-testid="skeleton" className={className} />,
  },
}))

const testConfig: JiraConfig = {
  domain: 'test',
  email: 'test@test.com',
  apiToken: 'token',
}

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: 'CON-1',
    summary: 'Test ticket summary',
    status: 'backlog',
    jiraStatus: 'Backlog',
    issueType: 'Task',
    priority: 'Medium',
    storyPoints: 3,
    epicKey: null,
    updatedAt: '2026-01-01T00:00:00Z',
    pullRequests: [],
    ...overrides,
  }
}

const noop = vi.fn()
const defaultCardProps = {
  config: testConfig,
  jiraBaseUrl: 'https://test.atlassian.net',
  isThinking: false,
  onOpenUrl: noop,
  onNewSession: noop,
  onContinueSession: noop,
  onStartWork: noop,
  onStartWorkInBackground: noop,
  onRefresh: noop,
}

describe('TicketCard', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('left border by issue type', () => {
    it('renders red left border for bugs', () => {
      const ticket = makeTicket({ issueType: 'Bug' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const card = container.firstElementChild as HTMLElement
      expect(card.className).toContain('border-l-red-500')
    })

    it('renders emerald left border for stories', () => {
      const ticket = makeTicket({ issueType: 'Story' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const card = container.firstElementChild as HTMLElement
      expect(card.className).toContain('border-l-emerald-500')
    })

    it('renders blue left border for tasks', () => {
      const ticket = makeTicket({ issueType: 'Task' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const card = container.firstElementChild as HTMLElement
      expect(card.className).toContain('border-l-blue-500')
    })

    it('defaults to blue border for unknown types', () => {
      const ticket = makeTicket({ issueType: 'Improvement' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const card = container.firstElementChild as HTMLElement
      expect(card.className).toContain('border-l-blue-500')
    })
  })

  describe('status lozenge', () => {
    it('shows Jira status text in a lozenge', () => {
      const ticket = makeTicket({ status: 'in_progress', jiraStatus: 'In Progress' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      // The lozenge should display the jiraStatus text
      const lozenge = container.querySelector('.uppercase.tracking-wide')
      expect(lozenge).toBeTruthy()
      expect(lozenge!.textContent).toBe('In Progress')
    })

    it('uses blue styling for in_progress status', () => {
      const ticket = makeTicket({ status: 'in_progress', jiraStatus: 'In Progress' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const lozenge = container.querySelector('.uppercase.tracking-wide')
      expect(lozenge!.className).toContain('text-blue-400')
    })

    it('uses emerald styling for done status', () => {
      const ticket = makeTicket({ status: 'done', jiraStatus: 'Done' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const lozenge = container.querySelector('.uppercase.tracking-wide')
      expect(lozenge!.className).toContain('text-emerald-400')
    })

    it('uses zinc styling for backlog status', () => {
      const ticket = makeTicket({ status: 'backlog', jiraStatus: 'Backlog' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const lozenge = container.querySelector('.uppercase.tracking-wide')
      expect(lozenge!.className).toContain('text-zinc-300')
    })
  })

  describe('priority indicator', () => {
    it('renders upward arrow for highest priority', () => {
      const ticket = makeTicket({ priority: 'Highest' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      // ArrowUp icon should be present with red color for highest
      const arrowUp = container.querySelector('.text-red-500')
      expect(arrowUp).toBeTruthy()
    })

    it('renders upward arrow for high priority', () => {
      const ticket = makeTicket({ priority: 'High' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const arrowUp = container.querySelector('.text-orange-500')
      expect(arrowUp).toBeTruthy()
    })

    it('renders minus for medium priority', () => {
      const ticket = makeTicket({ priority: 'Medium' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const minus = container.querySelector('.text-yellow-500')
      expect(minus).toBeTruthy()
    })

    it('renders downward arrow for low priority', () => {
      const ticket = makeTicket({ priority: 'Low' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const arrowDown = container.querySelector('.text-blue-400')
      expect(arrowDown).toBeTruthy()
    })

    it('renders nothing when priority is null', () => {
      const ticket = makeTicket({ priority: null })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      // No priority icons should exist
      const priorityIcons = container.querySelectorAll('.text-red-500, .text-orange-500, .text-yellow-500')
      // Only the issue type icon (blue-500) should be present, not priority
      expect(priorityIcons.length).toBe(0)
    })
  })

  describe('hover actions', () => {
    it('action buttons have opacity-0 by default', () => {
      const ticket = makeTicket()
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      // The action container should have opacity-0 class
      const actionContainer = container.querySelector('.opacity-0.group-hover\\:opacity-100')
      expect(actionContainer).toBeTruthy()
    })
  })

  describe('summary position', () => {
    it('renders summary as the first visible text content', () => {
      const ticket = makeTicket({ summary: 'Fix the login bug' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      // Summary should be in a paragraph element at the top of the card body
      const summary = container.querySelector('p')
      expect(summary).toBeTruthy()
      expect(summary!.textContent).toBe('Fix the login bug')
    })
  })

  describe('ticket key', () => {
    it('renders the ticket key as a clickable button', () => {
      const ticket = makeTicket({ key: 'CON-42' })
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const keyButton = screen.getByText('CON-42')
      expect(keyButton.tagName).toBe('BUTTON')
    })

    it('calls onOpenUrl when key is clicked', () => {
      const onOpenUrl = vi.fn()
      const ticket = makeTicket({ key: 'CON-42' })
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} onOpenUrl={onOpenUrl} />
      )
      fireEvent.click(screen.getByText('CON-42'))
      expect(onOpenUrl).toHaveBeenCalledWith(
        'https://test.atlassian.net/browse/CON-42',
        'CON-42'
      )
    })
  })

  describe('story points', () => {
    it('shows story points in a circular badge', () => {
      const ticket = makeTicket({ storyPoints: 5 })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const badges = container.querySelectorAll('[data-testid="badge"]')
      const pointsBadge = Array.from(badges).find(b => b.textContent === '5')
      expect(pointsBadge).toBeTruthy()
      expect(pointsBadge!.className).toContain('rounded-full')
    })

    it('hides story points when null', () => {
      const ticket = makeTicket({ storyPoints: null })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const badges = container.querySelectorAll('[data-testid="badge"]')
      const pointsBadge = Array.from(badges).find(b => b.className?.includes('rounded-full'))
      expect(pointsBadge).toBeUndefined()
    })
  })

  describe('thinking state', () => {
    it('applies thinking-halo class when isThinking is true', () => {
      const ticket = makeTicket()
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} isThinking={true} />
      )
      const card = container.firstElementChild as HTMLElement
      expect(card.className).toContain('thinking-halo')
    })

    it('does not apply thinking-halo when isThinking is false', () => {
      const ticket = makeTicket()
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} isThinking={false} />
      )
      const card = container.firstElementChild as HTMLElement
      expect(card.className).not.toContain('thinking-halo')
    })
  })

  describe('PR badges', () => {
    it('shows PR badges when pull requests exist', () => {
      const ticket = makeTicket({
        pullRequests: [
          { id: '1', url: 'https://github.com/org/repo/pull/42', name: 'PR', status: 'OPEN' },
        ],
      })
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      expect(screen.getByText('PR#42')).toBeTruthy()
    })

    it('uses emerald color for merged PRs', () => {
      const ticket = makeTicket({
        pullRequests: [
          { id: '1', url: 'https://github.com/org/repo/pull/99', name: 'PR', status: 'MERGED' },
        ],
      })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const prBadge = screen.getByText('PR#99')
      expect(prBadge.className).toContain('text-emerald-400')
    })

    it('uses blue color for open PRs', () => {
      const ticket = makeTicket({
        pullRequests: [
          { id: '1', url: 'https://github.com/org/repo/pull/50', name: 'PR', status: 'OPEN' },
        ],
      })
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const prBadge = screen.getByText('PR#50')
      expect(prBadge.className).toContain('text-blue-400')
    })
  })

  describe('start work in background menu item', () => {
    it('renders a "Start work in background" dropdown item', () => {
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      expect(screen.getByText('Start work in background')).toBeTruthy()
    })

    it('calls onStartWorkInBackground when clicked', () => {
      const onStartWorkInBackground = vi.fn()
      const ticket = makeTicket({ key: 'CON-99' })
      render(
        <TicketCard
          ticket={ticket}
          {...defaultCardProps}
          onStartWorkInBackground={onStartWorkInBackground}
        />
      )
      fireEvent.click(screen.getByText('Start work in background'))
      expect(onStartWorkInBackground).toHaveBeenCalledWith(ticket)
    })

    it('renders alongside the "Start work" menu item', () => {
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      expect(screen.getByText('Start work')).toBeTruthy()
      expect(screen.getByText('Start work in background')).toBeTruthy()
    })
  })

  describe('active session indicator', () => {
    it('shows green pulse dot when session is active', () => {
      const ticket = makeTicket()
      const workSession = { id: '1', ticketKey: 'CON-1', status: 'active' }
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} workSession={workSession} />
      )
      const dot = container.querySelector('.bg-green-400.animate-pulse')
      expect(dot).toBeTruthy()
    })

    it('does not show dot when no active session', () => {
      const ticket = makeTicket()
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const dot = container.querySelector('.bg-green-400.animate-pulse')
      expect(dot).toBeNull()
    })
  })
})

describe('KanbanColumn', () => {
  const defaultColumnProps = {
    config: testConfig,
    jiraBaseUrl: 'https://test.atlassian.net',
    sessionThinking: {},
    onOpenUrl: noop,
    onNewSession: noop,
    onContinueSession: noop,
    onStartWork: noop,
    onStartWorkInBackground: noop,
    onRefresh: noop,
    workSessions: [],
  }

  describe('column header styling', () => {
    it('renders a colored status dot for backlog', () => {
      const { container } = render(
        <KanbanColumn
          title="Backlog"
          status="backlog"
          tickets={[]}
          {...defaultColumnProps}
        />
      )
      const dot = container.querySelector('.bg-zinc-500.rounded-full')
      expect(dot).toBeTruthy()
    })

    it('renders a blue status dot for in_progress', () => {
      const { container } = render(
        <KanbanColumn
          title="In Progress"
          status="in_progress"
          tickets={[]}
          {...defaultColumnProps}
        />
      )
      const dot = container.querySelector('.bg-blue-500.rounded-full')
      expect(dot).toBeTruthy()
    })

    it('renders an emerald status dot for done', () => {
      const { container } = render(
        <KanbanColumn
          title="Done"
          status="done"
          tickets={[]}
          {...defaultColumnProps}
        />
      )
      const dot = container.querySelector('.bg-emerald-500.rounded-full')
      expect(dot).toBeTruthy()
    })

    it('renders uppercase column title', () => {
      const { container } = render(
        <KanbanColumn
          title="In Progress"
          status="in_progress"
          tickets={[]}
          {...defaultColumnProps}
        />
      )
      const titleEl = container.querySelector('.uppercase.tracking-wide')
      expect(titleEl).toBeTruthy()
      expect(titleEl!.textContent).toBe('In Progress')
    })
  })

  describe('ticket count', () => {
    it('shows the count of filtered tickets', () => {
      const tickets = [
        makeTicket({ key: 'CON-1', status: 'backlog' }),
        makeTicket({ key: 'CON-2', status: 'backlog' }),
        makeTicket({ key: 'CON-3', status: 'in_progress' }),
      ]
      const { container } = render(
        <KanbanColumn
          title="Backlog"
          status="backlog"
          tickets={tickets}
          {...defaultColumnProps}
        />
      )
      // Should show "2" for the 2 backlog tickets
      const countEl = container.querySelector('.text-zinc-600')
      expect(countEl!.textContent).toBe('2')
    })
  })

  describe('empty state', () => {
    it('shows "No tickets" when column is empty', () => {
      render(
        <KanbanColumn
          title="Backlog"
          status="backlog"
          tickets={[]}
          {...defaultColumnProps}
        />
      )
      expect(screen.getByText('No tickets')).toBeTruthy()
    })
  })
})
