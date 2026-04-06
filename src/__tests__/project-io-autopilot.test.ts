import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore } from '../store/layout'
import { useProjectStore } from '../store/project'
import { serializeWorkspace } from '../lib/project-io'

/**
 * Tests that autoPilot state roundtrips through serialize → deserialize.
 * Regression test for CON-45: auto pilot turned off after app restart.
 */

function resetStores() {
  useTabsStore.setState({ groups: {}, selectedTabIds: {}, selectionAnchor: {} })
  useLayoutStore.setState({ root: null, focusedGroupId: null })
  useProjectStore.setState({ workspaceSettings: undefined })
}

describe('autoPilot persistence in serializeWorkspace (CON-45)', () => {
  beforeEach(() => {
    resetStores()
  })

  it('includes autoPilot: true in serialized tab data', () => {
    const groupId = 'g1'
    useTabsStore.setState({
      groups: {
        [groupId]: {
          id: groupId,
          activeTabId: 'tab-1',
          tabHistory: ['tab-1'],
          tabs: [
            { id: 'tab-1', type: 'claude-code', title: 'Claude', autoPilot: true },
          ],
        },
      },
    })
    useLayoutStore.setState({
      root: { type: 'leaf', groupId },
      focusedGroupId: groupId,
    })

    const workspace = serializeWorkspace()
    const serializedTab = workspace.groups[groupId].tabs[0]

    expect(serializedTab.autoPilot).toBe(true)
  })

  it('includes autoPilot: false in serialized tab data', () => {
    const groupId = 'g1'
    useTabsStore.setState({
      groups: {
        [groupId]: {
          id: groupId,
          activeTabId: 'tab-1',
          tabHistory: ['tab-1'],
          tabs: [
            { id: 'tab-1', type: 'claude-code', title: 'Claude', autoPilot: false },
          ],
        },
      },
    })
    useLayoutStore.setState({
      root: { type: 'leaf', groupId },
      focusedGroupId: groupId,
    })

    const workspace = serializeWorkspace()
    const serializedTab = workspace.groups[groupId].tabs[0]

    expect(serializedTab.autoPilot).toBe(false)
  })

  it('handles undefined autoPilot gracefully', () => {
    const groupId = 'g1'
    useTabsStore.setState({
      groups: {
        [groupId]: {
          id: groupId,
          activeTabId: 'tab-1',
          tabHistory: ['tab-1'],
          tabs: [
            { id: 'tab-1', type: 'terminal', title: 'Terminal' },
          ],
        },
      },
    })
    useLayoutStore.setState({
      root: { type: 'leaf', groupId },
      focusedGroupId: groupId,
    })

    const workspace = serializeWorkspace()
    const serializedTab = workspace.groups[groupId].tabs[0]

    expect(serializedTab.autoPilot).toBeUndefined()
  })

  it('preserves autoPilot across multiple tabs with different states', () => {
    const groupId = 'g1'
    useTabsStore.setState({
      groups: {
        [groupId]: {
          id: groupId,
          activeTabId: 'tab-1',
          tabHistory: ['tab-1', 'tab-2', 'tab-3'],
          tabs: [
            { id: 'tab-1', type: 'claude-code', title: 'Claude 1', autoPilot: true },
            { id: 'tab-2', type: 'claude-code', title: 'Claude 2', autoPilot: false },
            { id: 'tab-3', type: 'terminal', title: 'Terminal' },
          ],
        },
      },
    })
    useLayoutStore.setState({
      root: { type: 'leaf', groupId },
      focusedGroupId: groupId,
    })

    const workspace = serializeWorkspace()
    const tabs = workspace.groups[groupId].tabs

    expect(tabs[0].autoPilot).toBe(true)
    expect(tabs[1].autoPilot).toBe(false)
    expect(tabs[2].autoPilot).toBeUndefined()
  })

  it('roundtrips autoPilot: serialized data can restore the field', () => {
    // Simulate what restoreWorkspace does with the serialized data
    const groupId = 'g1'
    useTabsStore.setState({
      groups: {
        [groupId]: {
          id: groupId,
          activeTabId: 'tab-1',
          tabHistory: ['tab-1'],
          tabs: [
            { id: 'tab-1', type: 'claude-code', title: 'Claude', autoPilot: true },
          ],
        },
      },
    })
    useLayoutStore.setState({
      root: { type: 'leaf', groupId },
      focusedGroupId: groupId,
    })

    const workspace = serializeWorkspace()
    const serializedTab = workspace.groups[groupId].tabs[0]

    // Simulate the deserialization mapping from restoreWorkspace
    const restoredTab = {
      id: serializedTab.id,
      type: serializedTab.type,
      title: serializedTab.title,
      filePath: serializedTab.filePath,
      url: serializedTab.url,
      content: serializedTab.content,
      autoPilot: serializedTab.autoPilot,
      _terminalHistory: serializedTab.terminalHistory,
    }

    expect(restoredTab.autoPilot).toBe(true)
  })
})
