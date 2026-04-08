import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TicketCard } from '@np3/jira/TicketCard'
import { KanbanColumn } from '@np3/jira/KanbanColumn'
import type { Ticket, JiraConfig } from '@np3/jira/jira-api'

// Mock jira-api so network calls never fire
vi.mock('@np3/jira/jira-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@np3/jira/jira-api')>()
  return {
    ...actual,
    transitionTicket: vi.fn().mockResolvedValue(undefined),
    updateTicket: vi.fn().mockResolvedValue(undefined),
  }
})

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
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children, className }: any) => (
      <div data-testid="dropdown-content" className={className}>{children}</div>
    ),
    DropdownMenuItem: ({ children, onSelect, disabled }: any) => (
      <div data-testid="dropdown-item" onClick={!disabled ? onSelect : undefined}>{children}</div>
    ),
    DropdownMenuSeparator: () => <hr />,
    ContextMenu: ({ children }: any) => <div>{children}</div>,
    ContextMenuTrigger: ({ children }: any) => <div>{children}</div>,
    ContextMenuContent: ({ children, className }: any) => (
      <div data-testid="context-content" className={className}>{children}</div>
    ),
    ContextMenuItem: ({ children, onSelect, className }: any) => (
      <div data-testid="context-item" className={className} onClick={onSelect}>{children}</div>
    ),
    ContextMenuSeparator: () => <hr />,
    ContextMenuSub: ({ children }: any) => <div>{children}</div>,
    ContextMenuSubTrigger: ({ children }: any) => <div>{children}</div>,
    ContextMenuSubContent: ({ children }: any) => <div>{children}</div>,
    LinkContextMenu: ({ children }: any) => <>{children}</>,
    Tooltip: ({ children }: any) => <>{children}</>,
    TooltipTrigger: ({ children, asChild }: any) => <>{children}</>,
    TooltipContent: ({ children }: any) => <span data-testid="tooltip-content">{children}</span>,
    TooltipProvider: ({ children }: any) => <>{children}</>,
    Skeleton: ({ className }: any) => <div data-testid="skeleton" className={className} />,
    Collapsible: ({ children, open }: any) => open !== false ? <div>{children}</div> : null,
    CollapsibleTrigger: ({ children, className, ...rest }: any) => (
      <button className={className} {...rest}>{children}</button>
    ),
    CollapsibleContent: ({ children }: any) => <div>{children}</div>,
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
  onOpenInClaude: noop,
  onRefresh: noop,
}

describe('TicketCard', () => {
  beforeEach(() => vi.clearAllMocks())

  // ─── Visual / Structure ─────────────────────────────────────────────────────

  describe('card structure', () => {
    it('renders the ticket summary', () => {
      render(<TicketCard ticket={makeTicket({ summary: 'Fix login bug' })} {...defaultCardProps} />)
      expect(screen.getByText('Fix login bug')).toBeTruthy()
    })

    it('does NOT render a left-side colored border', () => {
      const { container } = render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      expect(container.querySelector('.border-l-\\[3px\\]')).toBeNull()
      expect(container.querySelector('.border-l-red-500')).toBeNull()
      expect(container.querySelector('.border-l-blue-500')).toBeNull()
      expect(container.querySelector('.border-l-emerald-500')).toBeNull()
    })

    it('does NOT render a status lozenge', () => {
      const { container } = render(<TicketCard ticket={makeTicket({ status: 'in_progress' })} {...defaultCardProps} />)
      expect(container.querySelector('.uppercase.tracking-wide')).toBeNull()
    })

    it('does NOT render bottom action bar buttons (Move / Start / Edit)', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      expect(screen.queryByText('Move')).toBeNull()
      // "Start code" appears inside meatball dropdown, not as a standalone bottom button
      // Verify it's inside dropdown-content, not a standalone button[data-testid="button"]
      const startButtons = screen.queryAllByText('Start code')
      const bottomButtons = document.querySelectorAll('[data-testid="button"]')
      expect(bottomButtons.length).toBe(0)
    })

    it('applies thinking-halo class when isThinking is true', () => {
      const { container } = render(
        <TicketCard ticket={makeTicket()} {...defaultCardProps} isThinking={true} />
      )
      expect(container.querySelector('.thinking-halo')).toBeTruthy()
    })

    it('does not apply thinking-halo when isThinking is false', () => {
      const { container } = render(
        <TicketCard ticket={makeTicket()} {...defaultCardProps} isThinking={false} />
      )
      expect(container.querySelector('.thinking-halo')).toBeNull()
    })
  })

  // ─── Ticket key ─────────────────────────────────────────────────────────────

  describe('ticket key', () => {
    it('renders the ticket key as a clickable button', () => {
      render(<TicketCard ticket={makeTicket({ key: 'CON-42' })} {...defaultCardProps} />)
      expect(screen.getByText('CON-42').tagName).toBe('BUTTON')
    })

    it('calls onOpenUrl with the Jira browse URL when key is clicked', () => {
      const onOpenUrl = vi.fn()
      render(<TicketCard ticket={makeTicket({ key: 'CON-42' })} {...defaultCardProps} onOpenUrl={onOpenUrl} />)
      fireEvent.click(screen.getByText('CON-42'))
      expect(onOpenUrl).toHaveBeenCalledWith('https://test.atlassian.net/browse/CON-42', 'CON-42')
    })
  })

  // ─── Priority indicator ──────────────────────────────────────────────────────

  describe('priority indicator', () => {
    it('shows red arrow for highest priority', () => {
      const { container } = render(<TicketCard ticket={makeTicket({ priority: 'Highest' })} {...defaultCardProps} />)
      expect(container.querySelector('.text-red-500')).toBeTruthy()
    })

    it('shows orange arrow for high priority', () => {
      const { container } = render(<TicketCard ticket={makeTicket({ priority: 'High' })} {...defaultCardProps} />)
      expect(container.querySelector('.text-orange-500')).toBeTruthy()
    })

    it('shows yellow minus for medium priority', () => {
      const { container } = render(<TicketCard ticket={makeTicket({ priority: 'Medium' })} {...defaultCardProps} />)
      expect(container.querySelector('.text-yellow-500')).toBeTruthy()
    })

    it('shows blue arrow for low priority', () => {
      const { container } = render(<TicketCard ticket={makeTicket({ priority: 'Low' })} {...defaultCardProps} />)
      expect(container.querySelector('.text-blue-400')).toBeTruthy()
    })

    it('renders nothing when priority is null', () => {
      const { container } = render(<TicketCard ticket={makeTicket({ priority: null })} {...defaultCardProps} />)
      expect(container.querySelector('.text-red-500, .text-orange-500, .text-yellow-500')).toBeNull()
    })
  })

  // ─── Story points ────────────────────────────────────────────────────────────

  describe('story points', () => {
    it('shows story points in a circular badge', () => {
      const { container } = render(<TicketCard ticket={makeTicket({ storyPoints: 5 })} {...defaultCardProps} />)
      const badges = container.querySelectorAll('[data-testid="badge"]')
      const pointsBadge = Array.from(badges).find(b => b.textContent === '5')
      expect(pointsBadge).toBeTruthy()
      expect(pointsBadge!.className).toContain('rounded-full')
    })

    it('hides story points when null', () => {
      const { container } = render(<TicketCard ticket={makeTicket({ storyPoints: null })} {...defaultCardProps} />)
      const badges = container.querySelectorAll('[data-testid="badge"]')
      expect(Array.from(badges).find(b => b.className?.includes('rounded-full'))).toBeUndefined()
    })
  })

  // ─── Active session indicator ────────────────────────────────────────────────

  describe('active session indicator', () => {
    it('shows green pulse dot when session is active', () => {
      const { container } = render(
        <TicketCard ticket={makeTicket()} {...defaultCardProps}
          workSession={{ id: '1', ticketKey: 'CON-1', status: 'active' }} />
      )
      expect(container.querySelector('.bg-green-400.animate-pulse')).toBeTruthy()
    })

    it('does not show dot when no session', () => {
      const { container } = render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      expect(container.querySelector('.bg-green-400.animate-pulse')).toBeNull()
    })

    it('does not show dot when session is completed', () => {
      const { container } = render(
        <TicketCard ticket={makeTicket()} {...defaultCardProps}
          workSession={{ id: '1', ticketKey: 'CON-1', status: 'completed' }} />
      )
      expect(container.querySelector('.bg-green-400.animate-pulse')).toBeNull()
    })
  })

  // ─── PR badges ───────────────────────────────────────────────────────────────

  describe('PR badges', () => {
    it('shows PR badge with number for open PRs', () => {
      render(<TicketCard ticket={makeTicket({
        pullRequests: [{ id: '1', url: 'https://github.com/org/repo/pull/42', name: 'PR', status: 'OPEN' }],
      })} {...defaultCardProps} />)
      expect(screen.getByText('PR#42')).toBeTruthy()
    })

    it('uses emerald color for merged PRs', () => {
      render(<TicketCard ticket={makeTicket({
        pullRequests: [{ id: '1', url: 'https://github.com/org/repo/pull/99', name: 'PR', status: 'MERGED' }],
      })} {...defaultCardProps} />)
      expect(screen.getByText('PR#99').className).toContain('text-emerald-400')
    })

    it('uses blue color for open PRs', () => {
      render(<TicketCard ticket={makeTicket({
        pullRequests: [{ id: '1', url: 'https://github.com/org/repo/pull/50', name: 'PR', status: 'OPEN' }],
      })} {...defaultCardProps} />)
      expect(screen.getByText('PR#50').className).toContain('text-blue-400')
    })

    it('renders PR badges in the bottom-right container (ml-auto)', () => {
      const { container } = render(<TicketCard ticket={makeTicket({
        pullRequests: [{ id: '1', url: 'https://github.com/org/repo/pull/7', name: 'PR', status: 'OPEN' }],
      })} {...defaultCardProps} />)
      const prBadge = screen.getByText('PR#7')
      const prContainer = prBadge.closest('[class*="ml-auto"]')
      expect(prContainer).toBeTruthy()
    })

    it('shows no PR badges when pullRequests is empty', () => {
      render(<TicketCard ticket={makeTicket({ pullRequests: [] })} {...defaultCardProps} />)
      expect(screen.queryByText(/^PR#/)).toBeNull()
    })

    it('renders multiple PR badges', () => {
      render(<TicketCard ticket={makeTicket({
        pullRequests: [
          { id: '1', url: 'https://github.com/org/repo/pull/10', name: 'PR1', status: 'OPEN' },
          { id: '2', url: 'https://github.com/org/repo/pull/11', name: 'PR2', status: 'MERGED' },
        ],
      })} {...defaultCardProps} />)
      expect(screen.getByText('PR#10')).toBeTruthy()
      expect(screen.getByText('PR#11')).toBeTruthy()
    })
  })

  // ─── Work session branch badge ───────────────────────────────────────────────

  describe('work session branch', () => {
    it('shows branch badge when worktree is present', () => {
      const { container } = render(
        <TicketCard ticket={makeTicket()} {...defaultCardProps}
          workSession={{ id: '1', status: 'active', worktree: { path: '/path', branch: 'con-1', baseBranch: 'main' } }} />
      )
      expect(screen.getByText('con-1')).toBeTruthy()
      expect(container.querySelector('.text-fuchsia-400')).toBeTruthy()
    })

    it('shows PR badge from worktree prUrl', () => {
      render(
        <TicketCard ticket={makeTicket()} {...defaultCardProps}
          workSession={{
            id: '1', status: 'active',
            worktree: { path: '/path', branch: 'con-1', baseBranch: 'main' },
            prUrl: 'https://github.com/org/repo/pull/5',
          }} />
      )
      expect(screen.getByText('PR')).toBeTruthy()
    })

    it('does not show branch row when no worktree and no PRs', () => {
      const { container } = render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      expect(container.querySelector('.text-fuchsia-400')).toBeNull()
    })
  })

  // ─── Meatball menu ───────────────────────────────────────────────────────────

  describe('meatball menu', () => {
    it('renders the ⋯ button always visible with white icon', () => {
      const { container } = render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      // Menu is always visible — no opacity-0 hiding
      const hiddenMeatball = container.querySelector('.opacity-0.group-hover\\:opacity-100')
      expect(hiddenMeatball).toBeNull()
      // Button uses white text
      const btn = container.querySelector('button.text-white')
      expect(btn).toBeTruthy()
    })

    it('shows "Start code" item when no active session', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      const items = screen.getAllByTestId('dropdown-item')
      expect(items.some(el => el.textContent?.includes('Start code'))).toBe(true)
    })

    it('shows "Continue session" instead of "Start code" when session is active', () => {
      render(
        <TicketCard ticket={makeTicket()} {...defaultCardProps}
          workSession={{ id: '1', status: 'active' }} />
      )
      const items = screen.getAllByTestId('dropdown-item')
      expect(items.some(el => el.textContent?.includes('Continue session'))).toBe(true)
      expect(items.some(el => el.textContent === 'Start code')).toBe(false)
    })

    it('shows "Start code (background)" item', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      const items = screen.getAllByTestId('dropdown-item')
      expect(items.some(el => el.textContent?.includes('Start code (background)'))).toBe(true)
    })

    it('shows "Open worktree in Terminal" item', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      const items = screen.getAllByTestId('dropdown-item')
      expect(items.some(el => el.textContent?.includes('Open worktree in Terminal'))).toBe(true)
    })

    it('shows "Open worktree in VSCode" item', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      const items = screen.getAllByTestId('dropdown-item')
      expect(items.some(el => el.textContent?.includes('Open worktree in VSCode'))).toBe(true)
    })

    it('shows "Move to Backlog", "Move to In Progress", "Move to Done"', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      const items = screen.getAllByTestId('dropdown-item')
      expect(items.some(el => el.textContent?.includes('Move to Backlog'))).toBe(true)
      expect(items.some(el => el.textContent?.includes('Move to In Progress'))).toBe(true)
      expect(items.some(el => el.textContent?.includes('Move to Done'))).toBe(true)
    })

    it('calls onStartWork when "Start code" is clicked', () => {
      const onStartWork = vi.fn()
      const ticket = makeTicket()
      render(<TicketCard ticket={ticket} {...defaultCardProps} onStartWork={onStartWork} />)
      const items = screen.getAllByTestId('dropdown-item')
      const startItem = items.find(el => el.textContent === 'Start code')!
      fireEvent.click(startItem)
      expect(onStartWork).toHaveBeenCalledWith(ticket)
    })

    it('calls onContinueSession when "Continue session" is clicked', () => {
      const onContinueSession = vi.fn()
      const ticket = makeTicket()
      render(
        <TicketCard ticket={ticket} {...defaultCardProps} onContinueSession={onContinueSession}
          workSession={{ id: '1', status: 'active' }} />
      )
      const items = screen.getAllByTestId('dropdown-item')
      const continueItem = items.find(el => el.textContent?.includes('Continue session'))!
      fireEvent.click(continueItem)
      expect(onContinueSession).toHaveBeenCalledWith(ticket)
    })

    it('calls onStartWorkInBackground when "Start code (background)" is clicked', () => {
      const onStartWorkInBackground = vi.fn()
      const ticket = makeTicket()
      render(<TicketCard ticket={ticket} {...defaultCardProps} onStartWorkInBackground={onStartWorkInBackground} />)
      const items = screen.getAllByTestId('dropdown-item')
      const bgItem = items.find(el => el.textContent?.includes('Start code (background)'))!
      fireEvent.click(bgItem)
      expect(onStartWorkInBackground).toHaveBeenCalledWith(ticket)
    })

    it('calls onOpenInTerminal when "Open worktree in Terminal" is clicked', () => {
      const onOpenInTerminal = vi.fn()
      const ticket = makeTicket()
      render(<TicketCard ticket={ticket} {...defaultCardProps} onOpenInTerminal={onOpenInTerminal} />)
      const items = screen.getAllByTestId('dropdown-item')
      const terminalItem = items.find(el => el.textContent?.includes('Open worktree in Terminal'))!
      fireEvent.click(terminalItem)
      expect(onOpenInTerminal).toHaveBeenCalledWith(ticket)
    })

    it('calls onOpenInVSCode when "Open worktree in VSCode" is clicked', () => {
      const onOpenInVSCode = vi.fn()
      const ticket = makeTicket()
      render(<TicketCard ticket={ticket} {...defaultCardProps} onOpenInVSCode={onOpenInVSCode} />)
      const items = screen.getAllByTestId('dropdown-item')
      const vscodeItem = items.find(el => el.textContent?.includes('Open worktree in VSCode'))!
      fireEvent.click(vscodeItem)
      expect(onOpenInVSCode).toHaveBeenCalledWith(ticket)
    })

    it('shows "Open worktree in Claude" item', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      const items = screen.getAllByTestId('dropdown-item')
      expect(items.some(el => el.textContent?.includes('Open worktree in Claude'))).toBe(true)
    })

    it('calls onOpenInClaude when "Open worktree in Claude" is clicked', () => {
      const onOpenInClaude = vi.fn()
      const ticket = makeTicket()
      render(<TicketCard ticket={ticket} {...defaultCardProps} onOpenInClaude={onOpenInClaude} />)
      const items = screen.getAllByTestId('dropdown-item')
      const claudeItem = items.find(el => el.textContent?.includes('Open worktree in Claude'))!
      fireEvent.click(claudeItem)
      expect(onOpenInClaude).toHaveBeenCalledWith(ticket)
    })

    it('dropdown content has shadow class', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      const content = screen.getAllByTestId('dropdown-content')[0]
      expect(content.className).toContain('shadow-xl')
    })
  })

  // ─── Inline editing ──────────────────────────────────────────────────────────

  describe('inline editing', () => {
    it('summary is rendered as a paragraph (not textarea) by default', () => {
      const { container } = render(<TicketCard ticket={makeTicket({ summary: 'Hello' })} {...defaultCardProps} />)
      expect(container.querySelector('p')).toBeTruthy()
      expect(container.querySelector('textarea')).toBeNull()
    })

    it('clicking summary switches to textarea', () => {
      const { container } = render(<TicketCard ticket={makeTicket({ summary: 'Hello' })} {...defaultCardProps} />)
      fireEvent.click(container.querySelector('p')!)
      expect(container.querySelector('textarea')).toBeTruthy()
      expect(container.querySelector('p')).toBeNull()
    })

    it('textarea is pre-filled with current summary', () => {
      const { container } = render(<TicketCard ticket={makeTicket({ summary: 'Fix bug' })} {...defaultCardProps} />)
      fireEvent.click(container.querySelector('p')!)
      const ta = container.querySelector('textarea')!
      expect(ta.value).toBe('Fix bug')
    })

    it('pressing Escape cancels edit and restores paragraph', () => {
      const { container } = render(<TicketCard ticket={makeTicket({ summary: 'Original' })} {...defaultCardProps} />)
      fireEvent.click(container.querySelector('p')!)
      fireEvent.keyDown(container.querySelector('textarea')!, { key: 'Escape' })
      expect(container.querySelector('p')).toBeTruthy()
      expect(container.querySelector('p')!.textContent).toBe('Original')
    })

    it('pressing Enter saves and calls updateTicket', async () => {
      const { updateTicket } = await import('@np3/jira/jira-api')
      const onRefresh = vi.fn()
      const { container } = render(
        <TicketCard ticket={makeTicket({ key: 'CON-5', summary: 'Old summary' })}
          {...defaultCardProps} onRefresh={onRefresh} />
      )
      fireEvent.click(container.querySelector('p')!)
      const ta = container.querySelector('textarea')!
      fireEvent.change(ta, { target: { value: 'New summary' } })
      fireEvent.keyDown(ta, { key: 'Enter' })
      await waitFor(() => expect(updateTicket).toHaveBeenCalledWith(
        testConfig, 'CON-5', { summary: 'New summary' }
      ))
      await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    })

    it('blurring textarea saves the edit', async () => {
      const { updateTicket } = await import('@np3/jira/jira-api')
      const { container } = render(
        <TicketCard ticket={makeTicket({ key: 'CON-6', summary: 'Old' })} {...defaultCardProps} />
      )
      fireEvent.click(container.querySelector('p')!)
      const ta = container.querySelector('textarea')!
      fireEvent.change(ta, { target: { value: 'Blurred save' } })
      fireEvent.blur(ta)
      await waitFor(() => expect(updateTicket).toHaveBeenCalledWith(
        testConfig, 'CON-6', { summary: 'Blurred save' }
      ))
    })

    it('does not call updateTicket if summary is unchanged', async () => {
      const { updateTicket } = await import('@np3/jira/jira-api')
      const { container } = render(
        <TicketCard ticket={makeTicket({ summary: 'Same' })} {...defaultCardProps} />
      )
      fireEvent.click(container.querySelector('p')!)
      fireEvent.blur(container.querySelector('textarea')!)
      await new Promise(r => setTimeout(r, 50))
      expect(updateTicket).not.toHaveBeenCalled()
    })

    it('does not call updateTicket if trimmed value is empty', async () => {
      const { updateTicket } = await import('@np3/jira/jira-api')
      const { container } = render(
        <TicketCard ticket={makeTicket({ summary: 'Some text' })} {...defaultCardProps} />
      )
      fireEvent.click(container.querySelector('p')!)
      fireEvent.change(container.querySelector('textarea')!, { target: { value: '   ' } })
      fireEvent.blur(container.querySelector('textarea')!)
      await new Promise(r => setTimeout(r, 50))
      expect(updateTicket).not.toHaveBeenCalled()
    })

    it('Shift+Enter does not save (allows newline)', () => {
      const { container } = render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      fireEvent.click(container.querySelector('p')!)
      const ta = container.querySelector('textarea')!
      fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true })
      // Should still be editing
      expect(container.querySelector('textarea')).toBeTruthy()
    })
  })

  // ─── Context menu ─────────────────────────────────────────────────────────────

  describe('context menu', () => {
    it('renders "Open in Claude" action', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      expect(screen.getByText('Open in Claude')).toBeTruthy()
    })

    it('renders "Start code" action in context menu', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      const contextItems = screen.getAllByTestId('context-item')
      expect(contextItems.some(el => el.textContent === 'Start code')).toBe(true)
    })

    it('renders "Start code (background)" action in context menu', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      const contextItems = screen.getAllByTestId('context-item')
      expect(contextItems.some(el => el.textContent?.includes('Start code (background)'))).toBe(true)
    })

    it('renders "Open worktree in Terminal" in context menu', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      const contextItems = screen.getAllByTestId('context-item')
      expect(contextItems.some(el => el.textContent?.includes('Open worktree in Terminal'))).toBe(true)
    })

    it('renders "Open worktree in VSCode" in context menu', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      const contextItems = screen.getAllByTestId('context-item')
      expect(contextItems.some(el => el.textContent?.includes('Open worktree in VSCode'))).toBe(true)
    })

    it('renders "Edit ticket" in context menu', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      expect(screen.getByText('Edit ticket')).toBeTruthy()
    })

    it('renders "Open in Jira" in context menu', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      expect(screen.getByText('Open in Jira')).toBeTruthy()
    })

    it('renders "Move to" sub-trigger in context menu', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      expect(screen.getByText('Move to')).toBeTruthy()
    })

    it('renders "Backlog", "In Progress", "Done" in the Move submenu', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      expect(screen.getByText('Backlog')).toBeTruthy()
      expect(screen.getByText('In Progress')).toBeTruthy()
      expect(screen.getByText('Done')).toBeTruthy()
    })

    it('shows "Continue session" in context menu when session is active', () => {
      render(
        <TicketCard ticket={makeTicket()} {...defaultCardProps}
          workSession={{ id: '1', status: 'active' }} />
      )
      expect(screen.getAllByText('Continue session').length).toBeGreaterThan(0)
    })

    it('shows open PR links in context menu', () => {
      render(<TicketCard ticket={makeTicket({
        pullRequests: [{ id: '1', url: 'https://github.com/org/repo/pull/42', name: 'fix', status: 'OPEN' }],
      })} {...defaultCardProps} />)
      expect(screen.getByText('Open PR #42')).toBeTruthy()
    })

    it('does not show merged PRs in context menu', () => {
      render(<TicketCard ticket={makeTicket({
        pullRequests: [{ id: '1', url: 'https://github.com/org/repo/pull/99', name: 'fix', status: 'MERGED' }],
      })} {...defaultCardProps} />)
      expect(screen.queryByText('Open PR #99')).toBeNull()
    })

    it('calls onNewSession when "Open in Claude" is clicked', () => {
      const onNewSession = vi.fn()
      const ticket = makeTicket()
      render(<TicketCard ticket={ticket} {...defaultCardProps} onNewSession={onNewSession} />)
      fireEvent.click(screen.getByText('Open in Claude'))
      expect(onNewSession).toHaveBeenCalledWith(ticket)
    })

    it('calls onEditTicket when "Edit ticket" is clicked', () => {
      const onEditTicket = vi.fn()
      const ticket = makeTicket()
      render(<TicketCard ticket={ticket} {...defaultCardProps} onEditTicket={onEditTicket} />)
      fireEvent.click(screen.getByText('Edit ticket'))
      expect(onEditTicket).toHaveBeenCalledWith(ticket)
    })

    it('calls onOpenUrl with Jira URL when "Open in Jira" is clicked', () => {
      const onOpenUrl = vi.fn()
      const ticket = makeTicket({ key: 'CON-7' })
      render(<TicketCard ticket={ticket} {...defaultCardProps} onOpenUrl={onOpenUrl} />)
      fireEvent.click(screen.getByText('Open in Jira'))
      expect(onOpenUrl).toHaveBeenCalledWith('https://test.atlassian.net/browse/CON-7', 'CON-7')
    })

    it('context menu content has dark background styling', () => {
      render(<TicketCard ticket={makeTicket()} {...defaultCardProps} />)
      const contextContent = screen.getAllByTestId('context-content')[0]
      expect(contextContent.className).toContain('bg-zinc-900')
      expect(contextContent.className).toContain('border-zinc-700')
    })
  })
})

// ─── KanbanColumn ───────────────────────────────────────────────────────────────

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

  describe('column header', () => {
    it('renders zinc status dot for backlog', () => {
      const { container } = render(
        <KanbanColumn title="Backlog" status="backlog" tickets={[]} {...defaultColumnProps} />
      )
      expect(container.querySelector('.bg-zinc-500.rounded-full')).toBeTruthy()
    })

    it('renders blue status dot for in_progress', () => {
      const { container } = render(
        <KanbanColumn title="In Progress" status="in_progress" tickets={[]} {...defaultColumnProps} />
      )
      expect(container.querySelector('.bg-blue-500.rounded-full')).toBeTruthy()
    })

    it('renders emerald status dot for done', () => {
      const { container } = render(
        <KanbanColumn title="Done" status="done" tickets={[]} {...defaultColumnProps} />
      )
      expect(container.querySelector('.bg-emerald-500.rounded-full')).toBeTruthy()
    })

    it('renders uppercase column title', () => {
      const { container } = render(
        <KanbanColumn title="In Progress" status="in_progress" tickets={[]} {...defaultColumnProps} />
      )
      const titleEl = container.querySelector('.uppercase.tracking-wide')
      expect(titleEl?.textContent).toBe('In Progress')
    })
  })

  describe('ticket count', () => {
    it('shows count of tickets matching the column status', () => {
      const tickets = [
        makeTicket({ key: 'CON-1', status: 'backlog' }),
        makeTicket({ key: 'CON-2', status: 'backlog' }),
        makeTicket({ key: 'CON-3', status: 'in_progress' }),
      ]
      const { container } = render(
        <KanbanColumn title="Backlog" status="backlog" tickets={tickets} {...defaultColumnProps} />
      )
      const countEl = container.querySelector('.text-zinc-600')
      expect(countEl?.textContent).toBe('2')
    })

    it('shows 0 when no matching tickets', () => {
      const { container } = render(
        <KanbanColumn title="Done" status="done" tickets={[]} {...defaultColumnProps} />
      )
      const countEl = container.querySelector('.text-zinc-600')
      expect(countEl?.textContent).toBe('0')
    })
  })

  describe('empty state', () => {
    it('shows "No tickets" message when column is empty', () => {
      render(
        <KanbanColumn title="Backlog" status="backlog" tickets={[]} {...defaultColumnProps} />
      )
      expect(screen.getByText('No tickets')).toBeTruthy()
    })

    it('does not show "No tickets" when there are tickets', () => {
      render(
        <KanbanColumn title="Backlog" status="backlog"
          tickets={[makeTicket({ key: 'CON-1', status: 'backlog' })]}
          {...defaultColumnProps} />
      )
      expect(screen.queryByText('No tickets')).toBeNull()
    })
  })

  describe('ticket rendering', () => {
    it('renders TicketCards for tickets matching the column status', () => {
      const tickets = [
        makeTicket({ key: 'CON-10', status: 'backlog', summary: 'Backlog item' }),
        makeTicket({ key: 'CON-11', status: 'in_progress', summary: 'In progress item' }),
      ]
      render(
        <KanbanColumn title="Backlog" status="backlog" tickets={tickets} {...defaultColumnProps} />
      )
      expect(screen.getByText('Backlog item')).toBeTruthy()
      expect(screen.queryByText('In progress item')).toBeNull()
    })

    it('shows pending skeleton cards while ticket is being created', () => {
      const { container } = render(
        <KanbanColumn title="Backlog" status="backlog" tickets={[]}
          pendingTickets={[{ tempId: 'pending-1', status: 'backlog', epicKey: null }]}
          {...defaultColumnProps} />
      )
      expect(container.querySelectorAll('[data-testid="skeleton"]').length).toBeGreaterThan(0)
    })
  })

  describe('create ticket button', () => {
    it('renders a + button when onCreateTicket is provided', () => {
      const { container } = render(
        <KanbanColumn title="Backlog" status="backlog" tickets={[]}
          onCreateTicket={vi.fn()} {...defaultColumnProps} />
      )
      const plusButton = container.querySelector('button[title="New ticket"]')
      expect(plusButton).toBeTruthy()
    })

    it('does not render + button when onCreateTicket is not provided', () => {
      const { container } = render(
        <KanbanColumn title="Backlog" status="backlog" tickets={[]} {...defaultColumnProps} />
      )
      expect(container.querySelector('button[title="New ticket"]')).toBeNull()
    })

    it('calls onCreateTicket with the column status when + is clicked', () => {
      const onCreateTicket = vi.fn()
      const { container } = render(
        <KanbanColumn title="Backlog" status="backlog" tickets={[]}
          onCreateTicket={onCreateTicket} {...defaultColumnProps} />
      )
      fireEvent.click(container.querySelector('button[title="New ticket"]')!)
      expect(onCreateTicket).toHaveBeenCalledWith('backlog')
    })
  })

  describe('column background', () => {
    it('uses jira-sunken background for column', () => {
      const { container } = render(
        <KanbanColumn title="Backlog" status="backlog" tickets={[]} {...defaultColumnProps} />
      )
      const col = container.querySelector('.bg-jira-sunken')
      expect(col).toBeTruthy()
    })
  })
})
