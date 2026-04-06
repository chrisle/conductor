import { describe, it, expect, beforeEach } from 'vitest'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore } from '../store/layout'

/**
 * Tests for CON-50: double-clicking a session in the sidebar should add
 * the tab after the currently active tab in the focused group, not create
 * a new split panel.
 */

function resetStores() {
  useTabsStore.setState({ groups: {} })
  useLayoutStore.setState({ root: null, focusedGroupId: null })
}

describe('open session in existing tab group (CON-50)', () => {
  beforeEach(() => {
    resetStores()
  })

  it('adds tab after the active tab in the focused group', () => {
    // Setup: one group with 3 tabs, second tab is active
    const groupId = useTabsStore.getState().createGroup()
    const tabA = useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'A' })
    const tabB = useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'B' })
    const tabC = useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'C' })
    // Make B active
    useTabsStore.getState().setActiveTab(groupId, tabB)

    useLayoutStore.getState().setRoot({ type: 'leaf', groupId })
    useLayoutStore.getState().setFocusedGroup(groupId)

    // Simulate double-click: add session tab after active tab (B)
    const sessionTabId = useTabsStore.getState().addTab(
      groupId,
      { id: 'session-1', type: 'claude-code', title: 'Session 1' },
      { afterActiveTab: true }
    )

    const tabs = useTabsStore.getState().groups[groupId].tabs
    expect(tabs.map(t => t.title)).toEqual(['A', 'B', 'Session 1', 'C'])
    expect(useTabsStore.getState().groups[groupId].activeTabId).toBe(sessionTabId)
  })

  it('adds tab at end when no active tab exists', () => {
    const groupId = useTabsStore.getState().createGroup()
    // Empty group — no active tab

    const sessionTabId = useTabsStore.getState().addTab(
      groupId,
      { id: 'session-1', type: 'claude-code', title: 'Session 1' },
      { afterActiveTab: true }
    )

    const tabs = useTabsStore.getState().groups[groupId].tabs
    expect(tabs).toHaveLength(1)
    expect(tabs[0].id).toBe(sessionTabId)
  })

  it('adds tab after the last tab when active tab is last', () => {
    const groupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'A' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'B' })
    // B is active (last added)

    useTabsStore.getState().addTab(
      groupId,
      { id: 'session-1', type: 'claude-code', title: 'Session 1' },
      { afterActiveTab: true }
    )

    const tabs = useTabsStore.getState().groups[groupId].tabs
    expect(tabs.map(t => t.title)).toEqual(['A', 'B', 'Session 1'])
  })

  it('adds tab after the first tab when active tab is first', () => {
    const groupId = useTabsStore.getState().createGroup()
    const tabA = useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'A' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'B' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'C' })
    // Make A active
    useTabsStore.getState().setActiveTab(groupId, tabA)

    useTabsStore.getState().addTab(
      groupId,
      { id: 'session-1', type: 'claude-code', title: 'Session 1' },
      { afterActiveTab: true }
    )

    const tabs = useTabsStore.getState().groups[groupId].tabs
    expect(tabs.map(t => t.title)).toEqual(['A', 'Session 1', 'B', 'C'])
  })

  it('appends to end without afterActiveTab option (default behavior)', () => {
    const groupId = useTabsStore.getState().createGroup()
    const tabA = useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'A' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'B' })
    useTabsStore.getState().setActiveTab(groupId, tabA)

    // Without afterActiveTab — should append to end
    useTabsStore.getState().addTab(groupId, { type: 'claude-code', title: 'Session 1' })

    const tabs = useTabsStore.getState().groups[groupId].tabs
    expect(tabs.map(t => t.title)).toEqual(['A', 'B', 'Session 1'])
  })

  it('does not create a new panel split when double-clicking a session', () => {
    // Setup: existing panel with tabs
    const groupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'existing' })
    useLayoutStore.getState().setRoot({ type: 'leaf', groupId })
    useLayoutStore.getState().setFocusedGroup(groupId)

    // Simulate the new openInTab behavior: add to existing group
    useTabsStore.getState().addTab(
      groupId,
      { id: 'session-1', type: 'claude-code', title: 'Session' },
      { afterActiveTab: true }
    )
    useLayoutStore.getState().setFocusedGroup(groupId)

    // Verify: layout is still a single leaf, no split created
    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('leaf')

    // Verify: both tabs are in the same group
    const group = useTabsStore.getState().groups[groupId]
    expect(group.tabs).toHaveLength(2)
    expect(group.tabs[1].id).toBe('session-1')

    // Verify: no extra groups were created
    expect(Object.keys(useTabsStore.getState().groups)).toHaveLength(1)
  })

  it('focuses existing tab if session is already open', () => {
    // Setup: session already open in a panel
    const groupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(groupId, { id: 'session-1', type: 'claude-code', title: 'Session' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'other' })
    useLayoutStore.getState().setRoot({ type: 'leaf', groupId })

    // Re-adding with same id should just focus, not duplicate
    useTabsStore.getState().addTab(
      groupId,
      { id: 'session-1', type: 'claude-code', title: 'Session' },
      { afterActiveTab: true }
    )

    const group = useTabsStore.getState().groups[groupId]
    expect(group.tabs).toHaveLength(2) // No duplicate
    expect(group.activeTabId).toBe('session-1')
  })
})
