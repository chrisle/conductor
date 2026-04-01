import React, { StrictMode } from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TerminalTab from '../extensions/terminal/TerminalTab'

const { createXtermTerminalMock } = vi.hoisted(() => ({
  createXtermTerminalMock: vi.fn((container: HTMLElement) => {
    const root = document.createElement('div')
    root.className = 'terminal xterm'
    root.dataset.testTerminalRoot = String(createXtermTerminalMock.mock.calls.length)
    container.appendChild(root)

    return new Promise<{ term: any; fitAddon: any }>(() => {})
  }),
}))

vi.mock('../extensions/terminal/xterm-init', () => ({
  createXtermTerminal: createXtermTerminalMock,
}))

vi.mock('../lib/terminal-api', () => ({
  createTerminal: vi.fn(),
  writeTerminal: vi.fn(),
  resizeTerminal: vi.fn(),
  killTerminal: vi.fn(),
  setAutoPilot: vi.fn(),
  setTmuxOption: vi.fn(),
  capturePane: vi.fn().mockResolvedValue(null),
  onTerminalData: vi.fn(),
  offTerminalData: vi.fn(),
  onTerminalExit: vi.fn(),
  offTerminalExit: vi.fn(),
}))

vi.mock('../hooks/useResolvedSettings', () => ({
  useResolvedSettings: () => ({
    terminal: {
      tmuxMouse: false,
    },
  }),
}))

describe('TerminalTab', () => {
  beforeEach(() => {
    createXtermTerminalMock.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps only one xterm root during StrictMode double-mount', async () => {
    const { container } = render(
      <StrictMode>
        <TerminalTab
          tabId="tab-1"
          groupId="group-1"
          isActive
          tab={{ id: 'tab-1', type: 'terminal', title: 'Terminal' } as any}
        />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(createXtermTerminalMock).toHaveBeenCalledTimes(2)
    })

    expect(container.querySelectorAll('[data-test-terminal-root]')).toHaveLength(1)
  })
})
