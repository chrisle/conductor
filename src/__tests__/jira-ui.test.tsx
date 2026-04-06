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
    ContextMenu: ({ children }: any) => <div data-testid="context-menu">{children}</div>,
    ContextMenuTrigger: ({ children }: any) => <div data-testid="context-trigger">{children}</div>,
    ContextMenuContent: ({ children }: any) => <div data-testid="context-content">{children}</div>,
    ContextMenuItem: ({ children, onSelect, className }: any) => (
      <div data-testid="context-item" className={className} onClick={onSelect}>{children}</div>
    ),
    ContextMenuSeparator: () => <hr data-testid="context-separator" />,
    ContextMenuSub: ({ children }: any) => <div data-testid="context-sub">{children}</div>,
    ContextMenuSubTrigger: ({ children }: any) => <div data-testid="context-sub-trigger">{children}</div>,
    ContextMenuSubContent: ({ children }: any) => <div data-testid="context-sub-content">{children}</div>,
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
  onEditTicket: noop,
  onOpenInTerminal: noop,
  onOpenInVSCode: noop,
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
      const card = container.querySelector('.border-l-red-500')
      expect(card).toBeTruthy()
    })

    it('renders emerald left border for stories', () => {
      const ticket = makeTicket({ issueType: 'Story' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const card = container.querySelector('.border-l-emerald-500')
      expect(card).toBeTruthy()
    })

    it('renders blue left border for tasks', () => {
      const ticket = makeTicket({ issueType: 'Task' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const card = container.querySelector('.border-l-blue-500')
      expect(card).toBeTruthy()
    })

    it('defaults to blue border for unknown types', () => {
      const ticket = makeTicket({ issueType: 'Improvement' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const card = container.querySelector('.border-l-blue-500')
      expect(card).toBeTruthy()
    })
  })

  describe('status lozenge', () => {
    it('shows Jira status text in a lozenge', () => {
      const ticket = makeTicket({ status: 'in_progress', jiraStatus: 'In Progress' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
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
      expect(lozenge!.className).toContain('text-blue-300')
    })

    it('uses emerald styling for done status', () => {
      const ticket = makeTicket({ status: 'done', jiraStatus: 'Done' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const lozenge = container.querySelector('.uppercase.tracking-wide')
      expect(lozenge!.className).toContain('text-emerald-300')
    })

    it('uses zinc styling for backlog status', () => {
      const ticket = makeTicket({ status: 'backlog', jiraStatus: 'Backlog' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      const lozenge = container.querySelector('.uppercase.tracking-wide')
      expect(lozenge!.className).toContain('text-zinc-200')
    })
  })

  describe('priority indicator', () => {
    it('renders upward arrow for highest priority', () => {
      const ticket = makeTicket({ priority: 'Highest' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
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
      const priorityIcons = container.querySelectorAll('.text-red-500, .text-orange-500, .text-yellow-500')
      expect(priorityIcons.length).toBe(0)
    })
  })

  describe('action buttons visibility', () => {
    it('action buttons are always visible (no hover-only opacity)', () => {
      const ticket = makeTicket()
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      // Buttons should NOT be hidden behind opacity-0
      const hiddenContainer = container.querySelector('.opacity-0.group-hover\\:opacity-100')
      expect(hiddenContainer).toBeNull()
    })

    it('action buttons container is rendered without opacity classes', () => {
      const ticket = makeTicket()
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      // The Move, Start, and Edit buttons should be present and visible
      expect(screen.getByText('Move')).toBeTruthy()
      expect(screen.getByText('Start')).toBeTruthy()
    })
  })

  describe('summary position', () => {
    it('renders summary as the first visible text content', () => {
      const ticket = makeTicket({ summary: 'Fix the login bug' })
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
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
      const card = container.querySelector('.thinking-halo')
      expect(card).toBeTruthy()
    })

    it('does not apply thinking-halo when isThinking is false', () => {
      const ticket = makeTicket()
      const { container } = render(
        <TicketCard ticket={ticket} {...defaultCardProps} isThinking={false} />
      )
      const card = container.querySelector('.thinking-halo')
      expect(card).toBeNull()
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
      render(
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

  describe('start work in background context menu item', () => {
    it('renders a "Start coding in background" context menu item', () => {
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      expect(screen.getByText('Start coding in background')).toBeTruthy()
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
      fireEvent.click(screen.getByText('Start coding in background'))
      expect(onStartWorkInBackground).toHaveBeenCalledWith(ticket)
    })

    it('renders alongside the "Start coding in tab" menu item', () => {
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      expect(screen.getByText('Start coding in tab')).toBeTruthy()
      expect(screen.getByText('Start coding in background')).toBeTruthy()
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

  describe('context menu', () => {
    it('renders context menu with coding actions', () => {
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      // Context menu items should include the new actions
      expect(screen.getByText('Open in Claude')).toBeTruthy()
      expect(screen.getByText('Start coding in tab')).toBeTruthy()
      expect(screen.getByText('Start coding in background')).toBeTruthy()
    })

    it('renders Terminal and VSCode actions in context menu', () => {
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      expect(screen.getByText('Open in Terminal')).toBeTruthy()
      expect(screen.getByText('Open in VSCode')).toBeTruthy()
    })

    it('renders Edit ticket in context menu', () => {
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      expect(screen.getByText('Edit ticket')).toBeTruthy()
    })

    it('renders Open in Jira in context menu', () => {
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      expect(screen.getByText('Open in Jira')).toBeTruthy()
    })

    it('renders Move to submenu in context menu', () => {
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      expect(screen.getByText('Move to')).toBeTruthy()
    })

    it('calls onEditTicket when Edit ticket is clicked', () => {
      const onEditTicket = vi.fn()
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} onEditTicket={onEditTicket} />
      )
      fireEvent.click(screen.getByText('Edit ticket'))
      expect(onEditTicket).toHaveBeenCalledWith(ticket)
    })

    it('calls onOpenInTerminal when Open in Terminal is clicked', () => {
      const onOpenInTerminal = vi.fn()
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} onOpenInTerminal={onOpenInTerminal} />
      )
      fireEvent.click(screen.getByText('Open in Terminal'))
      expect(onOpenInTerminal).toHaveBeenCalledWith(ticket)
    })

    it('calls onOpenInVSCode when Open in VSCode is clicked', () => {
      const onOpenInVSCode = vi.fn()
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} onOpenInVSCode={onOpenInVSCode} />
      )
      fireEvent.click(screen.getByText('Open in VSCode'))
      expect(onOpenInVSCode).toHaveBeenCalledWith(ticket)
    })

    it('shows Continue session when session is active', () => {
      const ticket = makeTicket()
      const workSession = { id: '1', ticketKey: 'CON-1', status: 'active' }
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} workSession={workSession} />
      )
      expect(screen.getByText('Continue session')).toBeTruthy()
    })

    it('shows open PR links in context menu', () => {
      const ticket = makeTicket({
        pullRequests: [
          { id: '1', url: 'https://github.com/org/repo/pull/42', name: 'fix-bug', status: 'OPEN' },
        ],
      })
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      expect(screen.getByText('Open PR #42')).toBeTruthy()
    })
  })

  describe('quick action buttons', () => {
    it('shows Start button when no active session', () => {
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      expect(screen.getByText('Start')).toBeTruthy()
    })

    it('shows Continue button when session is active', () => {
      const ticket = makeTicket()
      const workSession = { id: '1', ticketKey: 'CON-1', status: 'active' }
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} workSession={workSession} />
      )
      expect(screen.getByText('Continue')).toBeTruthy()
    })

    it('shows Move button for status transitions', () => {
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} />
      )
      expect(screen.getByText('Move')).toBeTruthy()
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
    onEditTicket: noop,
    onOpenInTerminal: noop,
    onOpenInVSCode: noop,
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
