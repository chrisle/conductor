import { describe, it, expect, beforeEach } from 'vitest'
import { useTabsStore } from '../store/tabs'

// Reset zustand store between tests
function resetStore() {
  useTabsStore.setState({ groups: {} })
}

describe('useTabsStore', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('createGroup', () => {
    it('creates a new empty group', () => {
      const id = useTabsStore.getState().createGroup()
      const group = useTabsStore.getState().groups[id]
      expect(group).toBeDefined()
      expect(group.tabs).toEqual([])
      expect(group.activeTabId).toBeNull()
    })

    it('creates groups with unique ids', () => {
      const id1 = useTabsStore.getState().createGroup()
      const id2 = useTabsStore.getState().createGroup()
      expect(id1).not.toBe(id2)
    })
  })

  describe('removeGroup', () => {
    it('removes an existing group', () => {
      const id = useTabsStore.getState().createGroup()
      useTabsStore.getState().removeGroup(id)
      expect(useTabsStore.getState().groups[id]).toBeUndefined()
    })

    it('does nothing for a non-existent group', () => {
      useTabsStore.getState().createGroup()
      const before = { ...useTabsStore.getState().groups }
      useTabsStore.getState().removeGroup('nonexistent')
      expect(useTabsStore.getState().groups).toEqual(before)
    })
  })

  describe('addTab', () => {
    it('adds a tab and sets it as active', () => {
      const groupId = useTabsStore.getState().createGroup()
      const tabId = useTabsStore.getState().addTab(groupId, {
        type: 'text',
        title: 'test.txt'
      })
      const group = useTabsStore.getState().groups[groupId]
      expect(group.tabs).toHaveLength(1)
      expect(group.tabs[0].id).toBe(tabId)
      expect(group.tabs[0].title).toBe('test.txt')
      expect(group.activeTabId).toBe(tabId)
    })

    it('newly added tab becomes active', () => {
      const groupId = useTabsStore.getState().createGroup()
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'first' })
      const secondId = useTabsStore.getState().addTab(groupId, { type: 'text', title: 'second' })
      expect(useTabsStore.getState().groups[groupId].activeTabId).toBe(secondId)
    })

    it('returns state unchanged for non-existent group', () => {
      const before = { ...useTabsStore.getState().groups }
      useTabsStore.getState().addTab('nonexistent', { type: 'text', title: 'tab' })
      expect(useTabsStore.getState().groups).toEqual(before)
    })

    it('focuses existing tab when same id is provided again', () => {
      const groupId = useTabsStore.getState().createGroup()
      const tabId = useTabsStore.getState().addTab(groupId, { type: 'text', title: 'first' })
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'second' })
      // Re-add first by explicit id — should just focus, not duplicate
      useTabsStore.getState().addTab(groupId, { id: tabId, type: 'text', title: 'first' })
      expect(useTabsStore.getState().groups[groupId].tabs).toHaveLength(2)
      expect(useTabsStore.getState().groups[groupId].activeTabId).toBe(tabId)
    })
  })

  describe('removeTab', () => {
    it('removes a tab from the group', () => {
      const groupId = useTabsStore.getState().createGroup()
      const tabId = useTabsStore.getState().addTab(groupId, { type: 'text', title: 'tab' })
      useTabsStore.getState().removeTab(groupId, tabId)
      expect(useTabsStore.getState().groups[groupId].tabs).toHaveLength(0)
    })

    it('activates previous tab when active tab is removed', () => {
      const groupId = useTabsStore.getState().createGroup()
      const first = useTabsStore.getState().addTab(groupId, { type: 'text', title: 'first' })
      const second = useTabsStore.getState().addTab(groupId, { type: 'text', title: 'second' })
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'third' })

      // Remove third (active), should activate second
      useTabsStore.getState().removeTab(groupId, useTabsStore.getState().groups[groupId].activeTabId!)
      expect(useTabsStore.getState().groups[groupId].activeTabId).toBe(second)

      // Remove second (active), should activate first
      useTabsStore.getState().removeTab(groupId, second)
      expect(useTabsStore.getState().groups[groupId].activeTabId).toBe(first)
    })

    it('sets activeTabId to null when last tab removed', () => {
      const groupId = useTabsStore.getState().createGroup()
      const tabId = useTabsStore.getState().addTab(groupId, { type: 'text', title: 'only' })
      useTabsStore.getState().removeTab(groupId, tabId)
      expect(useTabsStore.getState().groups[groupId].activeTabId).toBeNull()
    })

    it('does not change activeTabId when removing a non-active tab', () => {
      const groupId = useTabsStore.getState().createGroup()
      const first = useTabsStore.getState().addTab(groupId, { type: 'text', title: 'first' })
      const second = useTabsStore.getState().addTab(groupId, { type: 'text', title: 'second' })
      // second is active
      useTabsStore.getState().removeTab(groupId, first)
      expect(useTabsStore.getState().groups[groupId].activeTabId).toBe(second)
    })
  })

  describe('setActiveTab', () => {
    it('changes the active tab', () => {
      const groupId = useTabsStore.getState().createGroup()
      const first = useTabsStore.getState().addTab(groupId, { type: 'text', title: 'first' })
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'second' })
      useTabsStore.getState().setActiveTab(groupId, first)
      expect(useTabsStore.getState().groups[groupId].activeTabId).toBe(first)
    })
  })

  describe('moveTab', () => {
    it('moves a tab between groups', () => {
      const g1 = useTabsStore.getState().createGroup()
      const g2 = useTabsStore.getState().createGroup()
      const tabId = useTabsStore.getState().addTab(g1, { type: 'text', title: 'movable' })

      useTabsStore.getState().moveTab(g1, tabId, g2)

      expect(useTabsStore.getState().groups[g1].tabs).toHaveLength(0)
      expect(useTabsStore.getState().groups[g2].tabs).toHaveLength(1)
      expect(useTabsStore.getState().groups[g2].tabs[0].id).toBe(tabId)
      expect(useTabsStore.getState().groups[g2].activeTabId).toBe(tabId)
    })

    it('inserts at specific index when atIndex is provided', () => {
      const g1 = useTabsStore.getState().createGroup()
      const g2 = useTabsStore.getState().createGroup()
      useTabsStore.getState().addTab(g2, { type: 'text', title: 'existing1' })
      useTabsStore.getState().addTab(g2, { type: 'text', title: 'existing2' })
      const tabId = useTabsStore.getState().addTab(g1, { type: 'text', title: 'inserted' })

      useTabsStore.getState().moveTab(g1, tabId, g2, 1)

      const tabs = useTabsStore.getState().groups[g2].tabs
      expect(tabs[1].id).toBe(tabId)
      expect(tabs[1].title).toBe('inserted')
    })

    it('updates source group active tab after move', () => {
      const g1 = useTabsStore.getState().createGroup()
      const g2 = useTabsStore.getState().createGroup()
      const first = useTabsStore.getState().addTab(g1, { type: 'text', title: 'first' })
      const second = useTabsStore.getState().addTab(g1, { type: 'text', title: 'second' })

      // second is active, move it
      useTabsStore.getState().moveTab(g1, second, g2)
      expect(useTabsStore.getState().groups[g1].activeTabId).toBe(first)
    })
  })

  describe('reorderTab', () => {
    it('reorders tabs within a group', () => {
      const groupId = useTabsStore.getState().createGroup()
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'A' })
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'B' })
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'C' })

      useTabsStore.getState().reorderTab(groupId, 2, 0)

      const titles = useTabsStore.getState().groups[groupId].tabs.map(t => t.title)
      expect(titles).toEqual(['C', 'A', 'B'])
    })

    it('moves first tab to end when toIndex equals tabs.length', () => {
      const groupId = useTabsStore.getState().createGroup()
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'A' })
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'B' })
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'C' })

      // Drag tab A (index 0) past the last tab (toIndex = 3, i.e. tabs.length)
      useTabsStore.getState().reorderTab(groupId, 0, 3)

      const titles = useTabsStore.getState().groups[groupId].tabs.map(t => t.title)
      expect(titles).toEqual(['B', 'C', 'A'])
    })

    it('moves middle tab to end when toIndex equals tabs.length', () => {
      const groupId = useTabsStore.getState().createGroup()
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'A' })
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'B' })
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'C' })

      // Drag tab B (index 1) past the last tab (toIndex = 3)
      useTabsStore.getState().reorderTab(groupId, 1, 3)

      const titles = useTabsStore.getState().groups[groupId].tabs.map(t => t.title)
      expect(titles).toEqual(['A', 'C', 'B'])
    })

    it('is a no-op when dragging the last tab to end zone', () => {
      const groupId = useTabsStore.getState().createGroup()
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'A' })
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'B' })
      useTabsStore.getState().addTab(groupId, { type: 'text', title: 'C' })

      // Drag last tab C (index 2) to the end zone (toIndex = 3) — should be no-op
      useTabsStore.getState().reorderTab(groupId, 2, 3)

      const titles = useTabsStore.getState().groups[groupId].tabs.map(t => t.title)
      expect(titles).toEqual(['A', 'B', 'C'])
    })
  })

  describe('updateTab', () => {
    it('updates tab properties', () => {
      const groupId = useTabsStore.getState().createGroup()
      const tabId = useTabsStore.getState().addTab(groupId, { type: 'text', title: 'original' })

      useTabsStore.getState().updateTab(groupId, tabId, { title: 'updated', isDirty: true })

      const tab = useTabsStore.getState().groups[groupId].tabs[0]
      expect(tab.title).toBe('updated')
      expect(tab.isDirty).toBe(true)
    })

    it('only updates specified fields', () => {
      const groupId = useTabsStore.getState().createGroup()
      const tabId = useTabsStore.getState().addTab(groupId, {
        type: 'text',
        title: 'test',
        filePath: '/some/path'
      })

      useTabsStore.getState().updateTab(groupId, tabId, { title: 'new title' })

      const tab = useTabsStore.getState().groups[groupId].tabs[0]
      expect(tab.title).toBe('new title')
      expect(tab.filePath).toBe('/some/path')
      expect(tab.type).toBe('text')
    })

    it('updates isThinking and thinkingTime fields', () => {
      const groupId = useTabsStore.getState().createGroup()
      const tabId = useTabsStore.getState().addTab(groupId, { type: 'claude-code', title: 'Claude Code' })

      useTabsStore.getState().updateTab(groupId, tabId, { isThinking: true, thinkingTime: '4m 35s' })

      const tab = useTabsStore.getState().groups[groupId].tabs[0]
      expect(tab.isThinking).toBe(true)
      expect(tab.thinkingTime).toBe('4m 35s')
    })

    it('clears isThinking and thinkingTime when thinking stops', () => {
      const groupId = useTabsStore.getState().createGroup()
      const tabId = useTabsStore.getState().addTab(groupId, { type: 'claude-code', title: 'Claude Code' })

      useTabsStore.getState().updateTab(groupId, tabId, { isThinking: true, thinkingTime: '2m 10s' })
      useTabsStore.getState().updateTab(groupId, tabId, { isThinking: false, thinkingTime: undefined })

      const tab = useTabsStore.getState().groups[groupId].tabs[0]
      expect(tab.isThinking).toBe(false)
      expect(tab.thinkingTime).toBeUndefined()
    })
  })

  describe('setGroupWorktree', () => {
    it('sets the worktree on a group', () => {
      const groupId = useTabsStore.getState().createGroup()
      useTabsStore.getState().setGroupWorktree(groupId, '/path/to/worktree')
      expect(useTabsStore.getState().groups[groupId].worktree).toBe('/path/to/worktree')
    })

    it('clears the worktree by setting undefined', () => {
      const groupId = useTabsStore.getState().createGroup()
      useTabsStore.getState().setGroupWorktree(groupId, '/path/to/worktree')
      useTabsStore.getState().setGroupWorktree(groupId, undefined)
      expect(useTabsStore.getState().groups[groupId].worktree).toBeUndefined()
    })

    it('does nothing for a non-existent group', () => {
      const before = { ...useTabsStore.getState().groups }
      useTabsStore.getState().setGroupWorktree('nonexistent', '/some/path')
      expect(useTabsStore.getState().groups).toEqual(before)
    })
  })

  describe('getGroup', () => {
    it('returns the group by id', () => {
      const groupId = useTabsStore.getState().createGroup()
      const group = useTabsStore.getState().getGroup(groupId)
      expect(group).toBeDefined()
      expect(group!.id).toBe(groupId)
    })

    it('returns undefined for non-existent group', () => {
      expect(useTabsStore.getState().getGroup('nope')).toBeUndefined()
    })
  })
})
