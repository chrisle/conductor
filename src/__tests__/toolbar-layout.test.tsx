import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TerminalTab from '../extensions/terminal/TerminalTab'

vi.hoisted(() => {})

vi.mock('../extensions/terminal/xterm-init', () => ({
  createXtermTerminal: vi.fn((container: HTMLElement) => {
    const root = document.createElement('div')
    root.className = 'terminal xterm'
    container.appendChild(root)
    return new Promise(() => {})
  }),
}))

vi.mock('../lib/terminal-api', () => ({
  createTerminal: vi.fn(),
  writeTerminal: vi.fn(),
  resizeTerminal: vi.fn(),
  killTerminal: vi.fn(),
  setAutoPilot: vi.fn(),
  captureScrollback: vi.fn().mockResolvedValue(null),
  onTerminalData: vi.fn(),
  offTerminalData: vi.fn(),
  onTerminalExit: vi.fn(),
  offTerminalExit: vi.fn(),
}))

describe('TerminalTab toolbar layout', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders footerLeft before the spacer and footer after the terminal ID', () => {
    render(
      <TerminalTab
        tabId="tab-1"
        groupId="group-1"
        isActive
        tab={{ id: 'tab-1', type: 'terminal', title: 'Terminal' } as any}
        footerLeft={<span data-testid="footer-left">Auto Pilot</span>}
        footer={<span data-testid="footer-right">Stats</span>}
        footerPosition="bottom"
      />,
    )

    const left = screen.getByTestId('footer-left')
    const right = screen.getByTestId('footer-right')

    // Both should be rendered
    expect(left).toBeTruthy()
    expect(right).toBeTruthy()

    // footerLeft should appear before the spacer (flex-1 div),
    // and footer should appear after the terminal ID.
    // Verify ordering by checking DOM position within the toolbar.
    const toolbar = left.closest('.flex.items-center')!
    const children = Array.from(toolbar.children)

    const leftIndex = children.findIndex((el) => el.contains(left))
    const rightIndex = children.findIndex((el) => el.contains(right))

    // The spacer is a div with flex-1 class
    const spacerIndex = children.findIndex(
      (el) => el instanceof HTMLElement && el.classList.contains('flex-1'),
    )

    // footerLeft must come before the spacer
    expect(leftIndex).toBeLessThan(spacerIndex)
    // footer must come after the spacer
    expect(rightIndex).toBeGreaterThan(spacerIndex)
  })

  it('renders footer on the right even without footerLeft', () => {
    render(
      <TerminalTab
        tabId="tab-2"
        groupId="group-1"
        isActive
        tab={{ id: 'tab-2', type: 'terminal', title: 'Terminal' } as any}
        footer={<span data-testid="footer-only">Stats</span>}
        footerPosition="bottom"
      />,
    )

    const footer = screen.getByTestId('footer-only')
    const toolbar = footer.closest('.flex.items-center')!
    const children = Array.from(toolbar.children)

    const footerIndex = children.findIndex((el) => el.contains(footer))
    const spacerIndex = children.findIndex(
      (el) => el instanceof HTMLElement && el.classList.contains('flex-1'),
    )

    // footer should still be after the spacer (right side)
    expect(footerIndex).toBeGreaterThan(spacerIndex)
  })
})
