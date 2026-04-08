import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LinkContextMenu } from '../components/ui/link-context-menu'

// Mock stores used by the component
vi.mock('../store/tabs', () => ({
  useTabsStore: Object.assign(
    () => ({ addTab: vi.fn() }),
    { getState: () => ({ groups: { g1: {} } }) },
  ),
}))
vi.mock('../store/layout', () => ({
  useLayoutStore: () => ({ focusedGroupId: 'g1' }),
}))

// Mock window.open
vi.stubGlobal('open', vi.fn())

describe('LinkContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders default labels "Go to Kanban Board" and "Open Jira"', () => {
    render(
      <LinkContextMenu url="https://jira.example.com/browse/CON-1">
        <button>Right-click me</button>
      </LinkContextMenu>,
    )

    // Trigger the context menu
    fireEvent.contextMenu(screen.getByText('Right-click me'))

    expect(screen.getByText('Go to Kanban Board')).toBeDefined()
    expect(screen.getByText('Open Jira')).toBeDefined()
  })

  it('renders custom labels when provided', () => {
    render(
      <LinkContextMenu
        url="https://example.com"
        openInAppLabel="View in App"
        openExternalLabel="Open External"
      >
        <button>Right-click me</button>
      </LinkContextMenu>,
    )

    fireEvent.contextMenu(screen.getByText('Right-click me'))

    expect(screen.getByText('View in App')).toBeDefined()
    expect(screen.getByText('Open External')).toBeDefined()
  })
})
