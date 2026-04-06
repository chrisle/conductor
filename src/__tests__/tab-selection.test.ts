import { describe, it, expect, beforeEach } from 'vitest'
import { useTabsStore } from '../store/tabs'

function resetStore() {
  useTabsStore.setState({ groups: {}, selectedTabIds: {}, selectionAnchor: {} })
}

/** Helper: create a group with N tabs and return { groupId, tabIds } */
function setupGroup(count: number) {
  const groupId = useTabsStore.getState().createGroup()
  const tabIds: string[] = []
  for (let i = 0; i < count; i++) {
    tabIds.push(
      useTabsStore.getState().addTab(groupId, {
        type: i % 2 === 0 ? 'terminal' : 'claude-code',
        title: `Tab ${i}`,
      })
    )
  }
  return { groupId, tabIds }
}

describe('Tab multi-selection', () => {
  beforeEach(() => resetStore())

  describe('toggleSelectTab', () => {
    it('selects a tab when none are selected', () => {
      const { groupId, tabIds } = setupGroup(3)
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[0])
      const sel = useTabsStore.getState().getSelectedTabIds(groupId)
      expect(sel).toEqual([tabIds[0]])
    })

    it('adds a second tab to the selection', () => {
      const { groupId, tabIds } = setupGroup(3)
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[0])
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[2])
      const sel = useTabsStore.getState().getSelectedTabIds(groupId)
      expect(sel).toEqual([tabIds[0], tabIds[2]])
    })

    it('deselects a tab that is already selected', () => {
      const { groupId, tabIds } = setupGroup(3)
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[0])
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[1])
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[0])
      const sel = useTabsStore.getState().getSelectedTabIds(groupId)
      expect(sel).toEqual([tabIds[1]])
    })

    it('sets the anchor to the toggled tab', () => {
      const { groupId, tabIds } = setupGroup(3)
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[1])
      expect(useTabsStore.getState().selectionAnchor[groupId]).toBe(tabIds[1])
    })
  })

  describe('selectTabRange', () => {
    it('selects a range from anchor to target (forward)', () => {
      const { groupId, tabIds } = setupGroup(5)
      // Set anchor via toggle
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[1])
      // Shift-click on tab 3
      useTabsStore.getState().selectTabRange(groupId, tabIds[3])
      const sel = useTabsStore.getState().getSelectedTabIds(groupId)
      expect(sel).toEqual([tabIds[1], tabIds[2], tabIds[3]])
    })

    it('selects a range from anchor to target (backward)', () => {
      const { groupId, tabIds } = setupGroup(5)
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[3])
      useTabsStore.getState().selectTabRange(groupId, tabIds[1])
      const sel = useTabsStore.getState().getSelectedTabIds(groupId)
      expect(sel).toEqual([tabIds[1], tabIds[2], tabIds[3]])
    })

    it('selects just one tab when there is no anchor', () => {
      const { groupId, tabIds } = setupGroup(3)
      useTabsStore.getState().selectTabRange(groupId, tabIds[1])
      const sel = useTabsStore.getState().getSelectedTabIds(groupId)
      expect(sel).toEqual([tabIds[1]])
    })

    it('replaces previous range on a new shift-click', () => {
      const { groupId, tabIds } = setupGroup(5)
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[0])
      useTabsStore.getState().selectTabRange(groupId, tabIds[2])
      // Now shift-click on tab 4 — anchor stays at 0
      useTabsStore.getState().selectTabRange(groupId, tabIds[4])
      const sel = useTabsStore.getState().getSelectedTabIds(groupId)
      expect(sel).toEqual([tabIds[0], tabIds[1], tabIds[2], tabIds[3], tabIds[4]])
    })
  })

  describe('clearSelection', () => {
    it('clears all selections for a group', () => {
      const { groupId, tabIds } = setupGroup(3)
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[0])
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[1])
      useTabsStore.getState().clearSelection(groupId)
      const sel = useTabsStore.getState().getSelectedTabIds(groupId)
      expect(sel).toEqual([])
    })

    it('resets the anchor', () => {
      const { groupId, tabIds } = setupGroup(3)
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[0])
      useTabsStore.getState().clearSelection(groupId)
      expect(useTabsStore.getState().selectionAnchor[groupId]).toBeNull()
    })
  })

  describe('getSelectedTabIds', () => {
    it('returns ids in tab order, not selection order', () => {
      const { groupId, tabIds } = setupGroup(4)
      // Select in reverse order
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[3])
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[1])
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[0])
      const sel = useTabsStore.getState().getSelectedTabIds(groupId)
      expect(sel).toEqual([tabIds[0], tabIds[1], tabIds[3]])
    })

    it('returns empty array for a group with no selections', () => {
      const { groupId } = setupGroup(3)
      expect(useTabsStore.getState().getSelectedTabIds(groupId)).toEqual([])
    })

    it('returns empty array for a nonexistent group', () => {
      expect(useTabsStore.getState().getSelectedTabIds('nonexistent')).toEqual([])
    })

    it('filters out removed tabs', () => {
      const { groupId, tabIds } = setupGroup(3)
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[0])
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[1])
      useTabsStore.getState().toggleSelectTab(groupId, tabIds[2])
      // Remove middle tab
      useTabsStore.getState().removeTab(groupId, tabIds[1])
      const sel = useTabsStore.getState().getSelectedTabIds(groupId)
      expect(sel).toEqual([tabIds[0], tabIds[2]])
    })
  })

  describe('selection independence between groups', () => {
    it('selecting in one group does not affect another', () => {
      const g1 = setupGroup(3)
      const g2 = setupGroup(3)
      useTabsStore.getState().toggleSelectTab(g1.groupId, g1.tabIds[0])
      useTabsStore.getState().toggleSelectTab(g2.groupId, g2.tabIds[2])
      expect(useTabsStore.getState().getSelectedTabIds(g1.groupId)).toEqual([g1.tabIds[0]])
      expect(useTabsStore.getState().getSelectedTabIds(g2.groupId)).toEqual([g2.tabIds[2]])
    })
  })
})
