import { describe, it, expect, beforeEach } from 'vitest'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore, type LayoutNode } from '../store/layout'

/**
 * Regression tests for CON-85: moving a tab to a NESW split should not
 * leave an empty pane in the layout.
 *
 * The root cause was that handleContentDrop (in TabGroup.tsx) fired twice
 * due to DOM event bubbling — once from the drag-capture overlay and again
 * from the parent content div. The second call created a new empty group
 * and inserted it into the layout; because the tab was already moved by
 * the first call, moveTab silently did nothing, leaving the empty pane.
 *
 * Fix: e.stopPropagation() in handleContentDrop prevents the double fire.
 * These tests verify the store-level invariant: after a split-drop the
 * layout must contain no leaf nodes whose group has zero tabs.
 */

function resetStores() {
  useTabsStore.setState({ groups: {} })
  useLayoutStore.setState({ root: null, focusedGroupId: null })
}

/**
 * Simulates exactly what handleContentDrop does in TabGroup for a content
 * split-drop (NESW). Returns the newly created group id.
 */
function simulateSplitDrop(
  sourceGroupId: string,
  tabId: string,
  targetGroupId: string,
  zone: 'north' | 'south' | 'east' | 'west',
): string {
  const newGroupId = useTabsStore.getState().createGroup()
  useLayoutStore.getState().insertPanel(targetGroupId, zone, newGroupId)
  useTabsStore.getState().moveTab(sourceGroupId, tabId, newGroupId)
  return newGroupId
}

/** Collect all leaf groupIds referenced in the layout tree. */
function collectGroupIds(node: LayoutNode): string[] {
  if (node.type === 'leaf') return [node.groupId]
  return node.children.flatMap(c => collectGroupIds(c.node))
}

/** Returns true if any layout leaf has an empty group in the tabs store. */
function hasEmptyPane(): boolean {
  const root = useLayoutStore.getState().root
  if (!root) return false
  const groups = useTabsStore.getState().groups
  return collectGroupIds(root).some(id => {
    const g = groups[id]
    return !g || g.tabs.length === 0
  })
}

describe('tab split-drop creates no empty pane (CON-85)', () => {
  beforeEach(() => {
    resetStores()
  })

  it('single split-drop (normal case) leaves no empty pane', () => {
    const g1 = useTabsStore.getState().createGroup()
    const tabId = useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'A' })
    useLayoutStore.getState().setRoot({ type: 'leaf', groupId: g1 })

    const newGroupId = simulateSplitDrop(g1, tabId, g1, 'east')

    // Source group is now empty — clean it up (as handleContentDrop does)
    const src = useTabsStore.getState().groups[g1]
    if (src && src.tabs.length === 0) {
      useLayoutStore.getState().removeGroup(g1)
      useTabsStore.getState().removeGroup(g1)
    }

    expect(hasEmptyPane()).toBe(false)
    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('leaf')
    if (root.type === 'leaf') expect(root.groupId).toBe(newGroupId)
  })

  it('double split-drop (bug: event fires twice) would produce an empty pane', () => {
    // This test documents the pre-fix behaviour to confirm the regression guard.
    // It simulates what happened BEFORE e.stopPropagation() was added: the drop
    // handler ran twice for the same event.
    const g1 = useTabsStore.getState().createGroup()
    const tabId = useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'A' })
    useLayoutStore.getState().setRoot({ type: 'leaf', groupId: g1 })

    // First fire (correct)
    simulateSplitDrop(g1, tabId, g1, 'east')

    // Second fire (the bug — same sourceGroupId/tabId, but tab is already gone)
    // The second createGroup + insertPanel still runs, leaving an empty leaf.
    simulateSplitDrop(g1, tabId, g1, 'east')

    // At this point, before source cleanup, there are extra empty groups
    const root = useLayoutStore.getState().root!
    const groups = useTabsStore.getState().groups
    const emptyLeaves = collectGroupIds(root).filter(id => {
      const g = groups[id]
      return !g || g.tabs.length === 0
    })
    // The double-fire creates at least one extra empty pane (the bug)
    expect(emptyLeaves.length).toBeGreaterThan(0)
  })

  it('split-drop from a multi-tab source does not leave empty pane', () => {
    const g1 = useTabsStore.getState().createGroup()
    const g2 = useTabsStore.getState().createGroup()
    const tabA = useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'A' })
    useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'B' })
    useTabsStore.getState().addTab(g2, { type: 'terminal', title: 'C' })
    useLayoutStore.getState().setRoot({
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: g1 }, size: 1 },
        { node: { type: 'leaf', groupId: g2 }, size: 1 },
      ],
    })

    simulateSplitDrop(g1, tabA, g2, 'south')

    // g1 still has tab B — no cleanup needed
    expect(hasEmptyPane()).toBe(false)
  })

  it('split-drop moving last tab from source cleans up source pane', () => {
    const g1 = useTabsStore.getState().createGroup()
    const g2 = useTabsStore.getState().createGroup()
    const tabId = useTabsStore.getState().addTab(g1, { type: 'terminal', title: 'A' })
    useTabsStore.getState().addTab(g2, { type: 'terminal', title: 'B' })
    useLayoutStore.getState().setRoot({
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: g1 }, size: 1 },
        { node: { type: 'leaf', groupId: g2 }, size: 1 },
      ],
    })

    simulateSplitDrop(g1, tabId, g2, 'east')

    // Cleanup empty source pane (mirrors handleContentDrop setTimeout logic)
    const src = useTabsStore.getState().groups[g1]
    if (src && src.tabs.length === 0) {
      useLayoutStore.getState().removeGroup(g1)
      useTabsStore.getState().removeGroup(g1)
    }

    expect(hasEmptyPane()).toBe(false)
  })
})
