import { describe, it, expect, beforeEach } from 'vitest'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore, type LayoutNode } from '../store/layout'

/**
 * Tests for CON-49: the drop zone for a tab should be the + button AND
 * the rest of the empty tab bar area.
 *
 * The tab bar's outer scrollable container now has onDragOver/onDrop
 * handlers that target index = group.tabs.length, so dropping anywhere
 * in the empty space after the last tab appends the dragged tab to the
 * end — same behavior as dropping on the + button itself.
 *
 * These tests exercise the same store operations that the UI handlers
 * invoke, confirming the "append to end" semantics work for all cases.
 */

function resetStores() {
  useTabsStore.setState({ groups: {} })
  useLayoutStore.setState({ root: null, focusedGroupId: null })
}

describe('dropping a tab on empty tab bar area (CON-49)', () => {
  beforeEach(() => {
    resetStores()
  })

  it('reorder: dropping in empty area moves tab to the end (same as + button)', () => {
    const groupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'A' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'B' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'C' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'D' })

    const tabs = useTabsStore.getState().groups[groupId].tabs
    // Simulate dropping first tab onto empty tab bar area (targetIndex = tabs.length)
    useTabsStore.getState().reorderTab(groupId, 0, tabs.length)

    const result = useTabsStore.getState().groups[groupId].tabs
    expect(result.map(t => t.title)).toEqual(['B', 'C', 'D', 'A'])
  })

  it('cross-group: dropping in empty area of another group appends tab', () => {
    const src = useTabsStore.getState().createGroup()
    const dest = useTabsStore.getState().createGroup()
    const tabId = useTabsStore.getState().addTab(src, { type: 'terminal', title: 'moving' })
    useTabsStore.getState().addTab(src, { type: 'terminal', title: 'staying' })
    useTabsStore.getState().addTab(dest, { type: 'terminal', title: 'X' })
    useTabsStore.getState().addTab(dest, { type: 'terminal', title: 'Y' })
    useTabsStore.getState().addTab(dest, { type: 'terminal', title: 'Z' })

    const destLen = useTabsStore.getState().groups[dest].tabs.length

    // Simulate dropping onto empty tab bar area of dest group
    useTabsStore.getState().moveTab(src, tabId, dest, destLen)

    expect(useTabsStore.getState().groups[dest].tabs.map(t => t.title))
      .toEqual(['X', 'Y', 'Z', 'moving'])
    expect(useTabsStore.getState().groups[src].tabs.map(t => t.title))
      .toEqual(['staying'])
  })

  it('cross-group: moving last tab via empty area cleans up source pane', () => {
    const g1 = useTabsStore.getState().createGroup()
    const g2 = useTabsStore.getState().createGroup()
    const tabId = useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'lone' })
    useTabsStore.getState().addTab(g2, { type: 'terminal', title: 'target' })

    const layout: LayoutNode = {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: g1 }, size: 1 },
        { node: { type: 'leaf', groupId: g2 }, size: 1 },
      ],
    }
    useLayoutStore.getState().setRoot(layout)

    const destLen = useTabsStore.getState().groups[g2].tabs.length

    // Drop lone tab from g1 onto empty area of g2
    useTabsStore.getState().moveTab(g1, tabId, g2, destLen)

    // g1 is empty, clean up (mirrors the setTimeout logic in handleTabDrop)
    expect(useTabsStore.getState().groups[g1].tabs).toHaveLength(0)
    useLayoutStore.getState().removeGroup(g1)
    useTabsStore.getState().removeGroup(g1)

    // Layout collapses to single leaf for g2
    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('leaf')
    if (root.type === 'leaf') {
      expect(root.groupId).toBe(g2)
    }

    expect(useTabsStore.getState().groups[g2].tabs.map(t => t.title))
      .toEqual(['target', 'lone'])
  })
})
