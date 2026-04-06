import { describe, it, expect, beforeEach } from 'vitest'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore, type LayoutNode } from '../store/layout'

/**
 * Tests for CON-43: the plus button acts as a drop zone for dragging tabs
 * to the end of a group.
 *
 * When a tab is dragged onto the "+" button, it should be placed after
 * the last tab in the group (targetIndex = group.tabs.length).
 * This replaces the old empty spacer div that sat between the last tab
 * and the plus button.
 */

function resetStores() {
  useTabsStore.setState({ groups: {} })
  useLayoutStore.setState({ root: null, focusedGroupId: null })
}

describe('dropping a tab on the plus button (CON-43)', () => {
  beforeEach(() => {
    resetStores()
  })

  it('reordering to tabs.length moves tab to the end', () => {
    // Setup: one group with 3 tabs, drag first tab to end
    const groupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'tab-A' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'tab-B' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'tab-C' })

    const tabs = useTabsStore.getState().groups[groupId].tabs
    expect(tabs.map(t => t.title)).toEqual(['tab-A', 'tab-B', 'tab-C'])

    // Simulate drop on plus button: targetIndex = tabs.length (3)
    useTabsStore.getState().reorderTab(groupId, 0, tabs.length)

    const reordered = useTabsStore.getState().groups[groupId].tabs
    expect(reordered.map(t => t.title)).toEqual(['tab-B', 'tab-C', 'tab-A'])
  })

  it('reordering middle tab to end via tabs.length', () => {
    const groupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'tab-A' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'tab-B' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'tab-C' })

    const tabs = useTabsStore.getState().groups[groupId].tabs

    // Drag middle tab (index 1) to end (index = tabs.length = 3)
    useTabsStore.getState().reorderTab(groupId, 1, tabs.length)

    const reordered = useTabsStore.getState().groups[groupId].tabs
    expect(reordered.map(t => t.title)).toEqual(['tab-A', 'tab-C', 'tab-B'])
  })

  it('moveTab to end of another group via tabs.length index', () => {
    // Setup: two groups, move a tab from g1 to end of g2
    const g1 = useTabsStore.getState().createGroup()
    const g2 = useTabsStore.getState().createGroup()
    const tabToMove = useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'mover' })
    useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'stays' })
    useTabsStore.getState().addTab(g2, { type: 'terminal', title: 'dest-A' })
    useTabsStore.getState().addTab(g2, { type: 'terminal', title: 'dest-B' })

    const destTabs = useTabsStore.getState().groups[g2].tabs

    // Simulate cross-group drop on the plus button: atIndex = destTabs.length (2)
    useTabsStore.getState().moveTab(g1, tabToMove, g2, destTabs.length)

    const g2Tabs = useTabsStore.getState().groups[g2].tabs
    expect(g2Tabs.map(t => t.title)).toEqual(['dest-A', 'dest-B', 'mover'])

    // Source group still has remaining tab
    expect(useTabsStore.getState().groups[g1].tabs).toHaveLength(1)
  })

  it('moveTab last tab to another group cleans up empty source', () => {
    // Setup: two panes, g1 has one tab
    const g1 = useTabsStore.getState().createGroup()
    const g2 = useTabsStore.getState().createGroup()
    const onlyTab = useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'only' })
    useTabsStore.getState().addTab(g2, { type: 'terminal', title: 'existing' })

    const layout: LayoutNode = {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: g1 }, size: 1 },
        { node: { type: 'leaf', groupId: g2 }, size: 1 },
      ],
    }
    useLayoutStore.getState().setRoot(layout)

    const destTabs = useTabsStore.getState().groups[g2].tabs

    // Drop the only tab from g1 onto g2's plus button
    useTabsStore.getState().moveTab(g1, onlyTab, g2, destTabs.length)

    // g1 is now empty — clean up (mirrors handleTabDrop logic)
    const src = useTabsStore.getState().groups[g1]
    expect(src.tabs).toHaveLength(0)

    useLayoutStore.getState().removeGroup(g1)
    useTabsStore.getState().removeGroup(g1)

    // Layout collapses to single leaf
    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('leaf')
    if (root.type === 'leaf') {
      expect(root.groupId).toBe(g2)
    }

    // g2 has both tabs, dropped tab at the end
    const g2Tabs = useTabsStore.getState().groups[g2].tabs
    expect(g2Tabs.map(t => t.title)).toEqual(['existing', 'only'])
  })
})
