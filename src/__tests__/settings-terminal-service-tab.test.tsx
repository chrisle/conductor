import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TerminalServiceTab from '../extensions/settings/TerminalServiceTab'

// Mock electronAPI on the existing window object
Object.defineProperty(window, 'electronAPI', {
  value: {
    conductordHealth: vi.fn().mockResolvedValue(true),
  },
  writable: true,
})

describe('TerminalServiceTab', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a scrollable container so content is not clipped', () => {
    const { container } = render(
      <TerminalServiceTab
        tabId="tab-1"
        groupId="group-1"
        isActive
        tab={{ id: 'tab-1', type: 'settings-terminal-service', title: 'Settings' } as any}
      />,
    )

    // The outermost div should allow vertical scrolling
    const outerDiv = container.firstElementChild as HTMLElement
    expect(outerDiv).toBeTruthy()
    expect(outerDiv.className).toContain('overflow-y-auto')
  })

  it('fills the full height of its container', () => {
    const { container } = render(
      <TerminalServiceTab
        tabId="tab-1"
        groupId="group-1"
        isActive
        tab={{ id: 'tab-1', type: 'settings-terminal-service', title: 'Settings' } as any}
      />,
    )

    const outerDiv = container.firstElementChild as HTMLElement
    expect(outerDiv.className).toContain('h-full')
    expect(outerDiv.className).toContain('w-full')
  })
})
