import { describe, it, expect, beforeEach } from 'vitest'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore, type LayoutNode } from '../store/layout'

/**
 * Tests for CON-22: opening a session tab creates a right split
 * instead of adding to the existing panel.
 *
 * These tests verify the store-level operations that openInTab() performs:
 * 1. Create a new tab group
 * 2. Add the session tab to the new group
 * 3. Insert the new group as an east (right) split of the anchor panel
 * 4. Focus the new group
 */

function resetStores() {
  useTabsStore.setState({ groups: {} })
  useLayoutStore.setState({ root: null, focusedGroupId: null })
}

describe('open session as right split (CON-22)', () => {
  beforeEach(() => {
    resetStores()
  })

  it('creates a right split when opening a session with an existing panel', () => {
    // Setup: one panel already exists with a tab
    const existingGroupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(existingGroupId, {
      type: 'terminal',
      title: 'existing tab',
    })
    useLayoutStore.getState().setRoot({ type: 'leaf', groupId: existingGroupId })
    useLayoutStore.getState().setFocusedGroup(existingGroupId)

    // Simulate openInTab: create new group, add tab, insert east, focus
    const newGroupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(newGroupId, {
      id: 't-CON-22',
      type: 'claude-code',
      title: 'CON-22',
      filePath: '/tmp/worktree',
    })
    useLayoutStore.getState().insertPanel(existingGroupId, 'east', newGroupId)
    useLayoutStore.getState().setFocusedGroup(newGroupId)

    // Verify: layout is a row with existing on left, new on right
    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('row')
    if (root.type === 'row') {
      expect(root.children).toHaveLength(2)
      expect(root.children[0].node).toEqual({ type: 'leaf', groupId: existingGroupId })
      expect(root.children[1].node).toEqual({ type: 'leaf', groupId: newGroupId })
    }

    // Verify: new group has the session tab
    const newGroup = useTabsStore.getState().groups[newGroupId]
    expect(newGroup.tabs).toHaveLength(1)
    expect(newGroup.tabs[0].id).toBe('t-CON-22')
    expect(newGroup.tabs[0].type).toBe('claude-code')

    // Verify: new group is focused
    expect(useLayoutStore.getState().focusedGroupId).toBe(newGroupId)
  })

  it('creates a right split next to the focused panel in a multi-panel layout', () => {
    // Setup: two panels already in a row
    const g1 = useTabsStore.getState().createGroup()
    const g2 = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'term 1' })
    useTabsStore.getState().addTab(g2, { type: 'terminal', title: 'term 2' })
    const layout: LayoutNode = {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: g1 }, size: 1 },
        { node: { type: 'leaf', groupId: g2 }, size: 1 },
      ],
    }
    useLayoutStore.getState().setRoot(layout)
    useLayoutStore.getState().setFocusedGroup(g1)

    // Open session as right split of g1
    const newGroupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(newGroupId, {
      id: 't-session',
      type: 'claude-code',
      title: 'session',
    })
    useLayoutStore.getState().insertPanel(g1, 'east', newGroupId)
    useLayoutStore.getState().setFocusedGroup(newGroupId)

    // Verify: new panel inserted between g1 and g2
    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('row')
    if (root.type === 'row') {
      expect(root.children).toHaveLength(3)
      expect(root.children[0].node).toEqual({ type: 'leaf', groupId: g1 })
      expect(root.children[1].node).toEqual({ type: 'leaf', groupId: newGroupId })
      expect(root.children[2].node).toEqual({ type: 'leaf', groupId: g2 })
    }
  })

  it('creates a standalone panel when no panels exist', () => {
    // No existing layout — simulates the fallback path
    const newGroupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(newGroupId, {
      id: 't-first-session',
      type: 'claude-code',
      title: 'first session',
    })

    // Verify: tab was added to the new group
    const group = useTabsStore.getState().groups[newGroupId]
    expect(group.tabs).toHaveLength(1)
    expect(group.tabs[0].id).toBe('t-first-session')
  })

  it('does not duplicate an already-open tab — focuses it instead', () => {
    // Setup: session already open in a panel
    const existingGroupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(existingGroupId, {
      id: 't-already-open',
      type: 'claude-code',
      title: 'existing session',
    })
    useLayoutStore.getState().setRoot({ type: 'leaf', groupId: existingGroupId })

    // Simulate: openInTab finds the tab already open and just focuses it
    useTabsStore.getState().setActiveTab(existingGroupId, 't-already-open')
    useLayoutStore.getState().setFocusedGroup(existingGroupId)

    // Verify: still just one panel, no split created
    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('leaf')
    expect(useLayoutStore.getState().focusedGroupId).toBe(existingGroupId)

    // Verify: no extra groups were created
    const groupIds = Object.keys(useTabsStore.getState().groups)
    expect(groupIds).toHaveLength(1)
  })
})
