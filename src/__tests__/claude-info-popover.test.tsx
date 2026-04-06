import React from 'react'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock TerminalTab to just render the footer props so we can test the info popover
vi.mock('../extensions/terminal/TerminalTab', () => ({
  default: ({ footer, footerLeft, hideTerminalId }: any) => (
    <div data-testid="terminal-tab" data-hide-terminal-id={hideTerminalId}>
      <div data-testid="footer-left">{footerLeft}</div>
      <div data-testid="footer">{footer}</div>
    </div>
  ),
}))

vi.mock('../extensions/ai-cli/contexts/useSessionDetect', () => ({
  useSessionDetect: vi.fn(() => 'sess-abc-123'),
}))

vi.mock('../extensions/ai-cli/contexts/useClaudeCodeSettings', () => ({
  useClaudeCodeSettings: vi.fn(() => ({
    apiProvider: 'anthropic',
    model: null,
    maxTurns: null,
    systemPromptFile: null,
    appendSystemPrompt: null,
    permissionMode: null,
    mcpServers: [],
  })),
}))

vi.mock('../extensions/ai-cli/hooks/useSessionMetrics', () => ({
  useSessionMetrics: vi.fn(() => null),
}))

vi.mock('../extensions/ai-cli/pty-handlers/usePtyHandlers', () => ({
  usePtyHandlers: vi.fn(() => undefined),
}))

vi.mock('../extensions/ai-cli/contexts/buildClaudeCommand', () => ({
  buildClaudeCommand: vi.fn((cmd: string) => cmd),
}))

vi.mock('../lib/terminal-api', () => ({
  setAutoPilot: vi.fn(),
}))

vi.mock('../lib/session-autopilot', () => ({
  getSessionAutoPilot: vi.fn(() => false),
  setSessionAutoPilot: vi.fn(),
}))

import ClaudeCodeTab from '../extensions/ai-cli/components/ClaudeCodeTab'
import { useSidebarStore } from '../store/sidebar'
import { useConfigStore } from '../store/config'

describe('ClaudeCodeTab info popover', () => {
  beforeEach(() => {
    useSidebarStore.setState({ rootPath: '/tmp/test' })
    useConfigStore.setState((prev: any) => ({
      ...prev,
      config: { ...prev.config, claudeAccounts: [] },
    }))
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the info icon button in the toolbar', () => {
    render(
      <ClaudeCodeTab
        tabId="tab-info-1"
        groupId="group-1"
        isActive
        tab={{ id: 'tab-info-1', type: 'claude-code', title: 'Claude' } as any}
      />,
    )

    const infoButton = screen.getByTitle('Show session IDs')
    expect(infoButton).toBeTruthy()
  })

  it('shows Terminal ID and Claude ID when info icon is clicked', () => {
    render(
      <ClaudeCodeTab
        tabId="tab-info-2"
        groupId="group-1"
        isActive
        tab={{ id: 'tab-info-2', type: 'claude-code', title: 'Claude' } as any}
      />,
    )

    // Popover should not be visible initially
    expect(screen.queryByText('Terminal ID')).toBeNull()

    // Click the info icon
    fireEvent.click(screen.getByTitle('Show session IDs'))

    // Both IDs should now be visible
    expect(screen.getByText('Terminal ID')).toBeTruthy()
    expect(screen.getByText('Claude ID')).toBeTruthy()
    expect(screen.getByText('tab-info-2')).toBeTruthy()
    expect(screen.getByText('sess-abc-123')).toBeTruthy()
  })

  it('has copy buttons for both IDs', () => {
    render(
      <ClaudeCodeTab
        tabId="tab-info-3"
        groupId="group-1"
        isActive
        tab={{ id: 'tab-info-3', type: 'claude-code', title: 'Claude' } as any}
      />,
    )

    fireEvent.click(screen.getByTitle('Show session IDs'))

    expect(screen.getByTitle('Copy Terminal ID')).toBeTruthy()
    expect(screen.getByTitle('Copy Claude ID')).toBeTruthy()
  })

  it('toggles the popover closed on second click', () => {
    render(
      <ClaudeCodeTab
        tabId="tab-info-4"
        groupId="group-1"
        isActive
        tab={{ id: 'tab-info-4', type: 'claude-code', title: 'Claude' } as any}
      />,
    )

    const infoButton = screen.getByTitle('Show session IDs')

    // Open
    fireEvent.click(infoButton)
    expect(screen.getByText('Terminal ID')).toBeTruthy()

    // Close
    fireEvent.click(infoButton)
    expect(screen.queryByText('Terminal ID')).toBeNull()
  })

  it('passes hideTerminalId to TerminalTab', () => {
    render(
      <ClaudeCodeTab
        tabId="tab-info-5"
        groupId="group-1"
        isActive
        tab={{ id: 'tab-info-5', type: 'claude-code', title: 'Claude' } as any}
      />,
    )

    const terminalTab = screen.getByTestId('terminal-tab')
    expect(terminalTab.getAttribute('data-hide-terminal-id')).toBe('true')
  })
})
