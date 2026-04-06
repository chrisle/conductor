import { describe, it, expect, beforeEach } from 'vitest'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore, type LayoutNode } from '../store/layout'

/**
 * Tests for CON-24: dragging the last tab out of a pane should remove that pane.
 *
 * When a tab is moved between groups via moveTab(), the source group may become
 * empty. The layout store's removeGroup() + tabs store's removeGroup() must be
 * called to clean up the empty pane. These tests verify the store-level behavior
 * that handleTabDrop() relies on.
 */

function resetStores() {
  useTabsStore.setState({ groups: {} })
  useLayoutStore.setState({ root: null, focusedGroupId: null })
}

describe('dragging last tab removes empty pane (CON-24)', () => {
  beforeEach(() => {
    resetStores()
  })

  it('moving the only tab from a group leaves the group empty', () => {
    // Setup: two panes side by side, source has one tab
    const g1 = useTabsStore.getState().createGroup()
    const g2 = useTabsStore.getState().createGroup()
    const tabId = useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'only tab' })
    useTabsStore.getState().addTab(g2, { type: 'terminal', title: 'dest tab' })

    const layout: LayoutNode = {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: g1 }, size: 1 },
        { node: { type: 'leaf', groupId: g2 }, size: 1 },
      ],
    }
    useLayoutStore.getState().setRoot(layout)

    // Move the only tab from g1 to g2
    useTabsStore.getState().moveTab(g1, tabId, g2)

    // Source group should now be empty
    expect(useTabsStore.getState().groups[g1].tabs).toHaveLength(0)
    // Destination should have both tabs
    expect(useTabsStore.getState().groups[g2].tabs).toHaveLength(2)
  })

  it('removing an empty group collapses the layout to a single leaf', () => {
    // Setup: two panes in a row
    const g1 = useTabsStore.getState().createGroup()
    const g2 = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'tab A' })
    useTabsStore.getState().addTab(g2, { type: 'terminal', title: 'tab B' })

    const layout: LayoutNode = {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: g1 }, size: 1 },
        { node: { type: 'leaf', groupId: g2 }, size: 1 },
      ],
    }
    useLayoutStore.getState().setRoot(layout)

    // Simulate what handleTabDrop now does: move tab then clean up
    const tabId = useTabsStore.getState().groups[g1].tabs[0].id
    useTabsStore.getState().moveTab(g1, tabId, g2)

    // Clean up: remove empty group from both stores (the fix in handleTabDrop)
    useLayoutStore.getState().removeGroup(g1)
    useTabsStore.getState().removeGroup(g1)

    // Layout should collapse to just g2 as a leaf
    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('leaf')
    if (root.type === 'leaf') {
      expect(root.groupId).toBe(g2)
    }

    // g1 should no longer exist in the tabs store
    expect(useTabsStore.getState().groups[g1]).toBeUndefined()
  })

  it('removing an empty group from a 3-pane layout leaves 2 panes', () => {
    // Setup: three panes in a row
    const g1 = useTabsStore.getState().createGroup()
    const g2 = useTabsStore.getState().createGroup()
    const g3 = useTabsStore.getState().createGroup()
    const tabId = useTabsStore.getState().addTab(g2, { type: 'terminal', title: 'middle tab' })
    useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'left tab' })
    useTabsStore.getState().addTab(g3, { type: 'terminal', title: 'right tab' })

    const layout: LayoutNode = {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: g1 }, size: 1 },
        { node: { type: 'leaf', groupId: g2 }, size: 1 },
        { node: { type: 'leaf', groupId: g3 }, size: 1 },
      ],
    }
    useLayoutStore.getState().setRoot(layout)

    // Move the only tab from g2 (middle) to g3 (right)
    useTabsStore.getState().moveTab(g2, tabId, g3)

    // Clean up the now-empty middle pane
    useLayoutStore.getState().removeGroup(g2)
    useTabsStore.getState().removeGroup(g2)

    // Layout should have 2 children remaining
    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('row')
    if (root.type === 'row') {
      expect(root.children).toHaveLength(2)
      expect(root.children[0].node).toEqual({ type: 'leaf', groupId: g1 })
      expect(root.children[1].node).toEqual({ type: 'leaf', groupId: g3 })
    }

    // g3 should have both tabs now
    expect(useTabsStore.getState().groups[g3].tabs).toHaveLength(2)
  })

  it('does not remove pane when source still has remaining tabs', () => {
    // Setup: two panes, source has two tabs
    const g1 = useTabsStore.getState().createGroup()
    const g2 = useTabsStore.getState().createGroup()
    const tabToMove = useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'move me' })
    useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'stay here' })
    useTabsStore.getState().addTab(g2, { type: 'terminal', title: 'dest' })

    const layout: LayoutNode = {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: g1 }, size: 1 },
        { node: { type: 'leaf', groupId: g2 }, size: 1 },
      ],
    }
    useLayoutStore.getState().setRoot(layout)

    // Move one tab (but g1 still has another)
    useTabsStore.getState().moveTab(g1, tabToMove, g2)

    // Source still has a tab — check the condition that handleTabDrop uses
    const src = useTabsStore.getState().groups[g1]
    expect(src.tabs.length).toBe(1) // still has one tab, so pane should NOT be removed

    // Layout should remain unchanged (2 panes)
    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('row')
    if (root.type === 'row') {
      expect(root.children).toHaveLength(2)
    }
  })
})
