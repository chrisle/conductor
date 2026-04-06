import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore } from '../store/layout'

/**
 * Tests for the Cmd+W "close tab" IPC behavior.
 *
 * When the Electron menu sends `tab:closeRequested`, the renderer should:
 *   1. Close the active tab in the focused group
 *   2. Remove the group if it becomes empty (and other groups exist)
 *   3. Fall back to closing the window when there are no tabs/groups
 */

// Simulate what App.tsx's tab:closeRequested handler does
function simulateCloseTabRequested() {
  const { focusedGroupId } = useLayoutStore.getState()
  if (!focusedGroupId) {
    window.electronAPI.close()
    return
  }
  const group = useTabsStore.getState().groups[focusedGroupId]
  if (!group || !group.activeTabId) {
    window.electronAPI.close()
    return
  }

  useTabsStore.getState().removeTab(focusedGroupId, group.activeTabId)

  const updatedGroup = useTabsStore.getState().groups[focusedGroupId]
  if (updatedGroup && updatedGroup.tabs.length === 0) {
    const allGroupIds = Object.keys(useTabsStore.getState().groups)
    if (allGroupIds.length > 1) {
      useLayoutStore.getState().removeGroup(focusedGroupId)
      useTabsStore.getState().removeGroup(focusedGroupId)
    }
  }
}

function resetStores() {
  useTabsStore.setState({ groups: {} })
  useLayoutStore.setState({ focusedGroupId: null })
}

describe('Cmd+W close tab via IPC', () => {
  beforeEach(() => {
    resetStores()
    vi.clearAllMocks()
  })

  it('closes the active tab in the focused group', () => {
    const groupId = useTabsStore.getState().createGroup()
    const tab1 = useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'tab1' })
    const tab2 = useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'tab2' })
    useLayoutStore.setState({ focusedGroupId: groupId })

    // tab2 is active (most recently added)
    expect(useTabsStore.getState().groups[groupId].activeTabId).toBe(tab2)

    simulateCloseTabRequested()

    // tab2 should be removed, tab1 becomes active
    const group = useTabsStore.getState().groups[groupId]
    expect(group.tabs).toHaveLength(1)
    expect(group.tabs[0].id).toBe(tab1)
    expect(group.activeTabId).toBe(tab1)
  })

  it('does not close the window when tabs remain', () => {
    const groupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'tab1' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'tab2' })
    useLayoutStore.setState({ focusedGroupId: groupId })

    simulateCloseTabRequested()

    expect(window.electronAPI.close).not.toHaveBeenCalled()
  })

  it('closes the window when no focused group exists', () => {
    // No groups, no focus
    simulateCloseTabRequested()

    expect(window.electronAPI.close).toHaveBeenCalled()
  })

  it('closes the window when the focused group has no active tab', () => {
    const groupId = useTabsStore.getState().createGroup()
    // Group exists but has no tabs (activeTabId is null)
    useLayoutStore.setState({ focusedGroupId: groupId })

    simulateCloseTabRequested()

    expect(window.electronAPI.close).toHaveBeenCalled()
  })

  it('removes empty group when other groups exist', () => {
    const group1 = useTabsStore.getState().createGroup()
    const group2 = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(group1, { type: 'terminal', title: 'only-tab' })
    useTabsStore.getState().addTab(group2, { type: 'terminal', title: 'other-tab' })
    useLayoutStore.setState({ focusedGroupId: group1 })

    simulateCloseTabRequested()

    // group1 should be removed since it's now empty and group2 still exists
    expect(useTabsStore.getState().groups[group1]).toBeUndefined()
    expect(useTabsStore.getState().groups[group2]).toBeDefined()
  })

  it('keeps the last group even when it becomes empty', () => {
    const groupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'only-tab' })
    useLayoutStore.setState({ focusedGroupId: groupId })

    simulateCloseTabRequested()

    // Group should still exist (it's the only one), just empty
    const group = useTabsStore.getState().groups[groupId]
    expect(group).toBeDefined()
    expect(group.tabs).toHaveLength(0)
    expect(group.activeTabId).toBeNull()
  })

  it('successively closes all tabs in order', () => {
    const groupId = useTabsStore.getState().createGroup()
    const tab1 = useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'tab1' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'tab2' })
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'tab3' })
    useLayoutStore.setState({ focusedGroupId: groupId })

    // Close tab3 (active)
    simulateCloseTabRequested()
    expect(useTabsStore.getState().groups[groupId].tabs).toHaveLength(2)

    // Close tab2 (now active)
    simulateCloseTabRequested()
    expect(useTabsStore.getState().groups[groupId].tabs).toHaveLength(1)
    expect(useTabsStore.getState().groups[groupId].activeTabId).toBe(tab1)

    // Close tab1 (last tab) — group stays, no window close
    simulateCloseTabRequested()
    expect(useTabsStore.getState().groups[groupId].tabs).toHaveLength(0)
  })
})
