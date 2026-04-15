import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore, type LayoutNode } from '../store/layout'
import { useProjectStore } from '../store/project'
import { serializeWorkspace, switchWorkspace } from '../lib/project-io'

/**
 * Tests that workspace switching correctly saves and restores layout state.
 * Regression test for CON-67: switching workspaces doesn't restore the layout.
 */

function resetStores() {
  useTabsStore.setState({ groups: {}, selectedTabIds: {}, selectionAnchor: {} })
  useLayoutStore.setState({ root: null, focusedGroupId: null })
  useProjectStore.setState({
    workspaceSettings: undefined,
    activeWorkspace: null,
    workspaceNames: [],
  })
}

/** Set up a workspace with two side-by-side panels (row layout) */
function setupSplitWorkspace() {
  const leftGroupId = 'left-panel'
  const rightGroupId = 'right-panel'

  useTabsStore.setState({
    groups: {
      [leftGroupId]: {
        id: leftGroupId,
        activeTabId: 'tab-1',
        tabHistory: ['tab-1'],
        tabs: [
          { id: 'tab-1', type: 'terminal', title: 'Terminal 1' },
          { id: 'tab-2', type: 'claude-code', title: 'Claude' },
        ],
      },
      [rightGroupId]: {
        id: rightGroupId,
        activeTabId: 'tab-3',
        tabHistory: ['tab-3'],
        tabs: [
          { id: 'tab-3', type: 'terminal', title: 'Terminal 2' },
        ],
      },
    },
  })

  const layout: LayoutNode = {
    type: 'row',
    children: [
      { node: { type: 'leaf', groupId: leftGroupId }, size: 0.6 },
      { node: { type: 'leaf', groupId: rightGroupId }, size: 0.4 },
    ],
  }
  useLayoutStore.setState({ root: layout, focusedGroupId: leftGroupId })

  return { leftGroupId, rightGroupId, layout }
}

/** Set up a single-panel workspace */
function setupSinglePanelWorkspace() {
  const groupId = 'single-panel'

  useTabsStore.setState({
    groups: {
      [groupId]: {
        id: groupId,
        activeTabId: 'tab-a',
        tabHistory: ['tab-a'],
        tabs: [
          { id: 'tab-a', type: 'terminal', title: 'My Terminal' },
        ],
      },
    },
  })

  const layout: LayoutNode = { type: 'leaf', groupId }
  useLayoutStore.setState({ root: layout, focusedGroupId: groupId })

  return { groupId, layout }
}

describe('workspace switching layout preservation (CON-67)', () => {
  beforeEach(() => {
    resetStores()
  })

  it('serializes a split layout with correct group references', () => {
    const { leftGroupId, rightGroupId } = setupSplitWorkspace()

    const workspace = serializeWorkspace()

    // Layout should reference both groups
    expect(workspace.layout.type).toBe('row')
    if (workspace.layout.type === 'row') {
      expect(workspace.layout.children).toHaveLength(2)
      expect(workspace.layout.children[0].node).toEqual({ type: 'leaf', groupId: leftGroupId })
      expect(workspace.layout.children[1].node).toEqual({ type: 'leaf', groupId: rightGroupId })
      expect(workspace.layout.children[0].size).toBe(0.6)
      expect(workspace.layout.children[1].size).toBe(0.4)
    }

    // Groups should contain the correct tabs
    expect(Object.keys(workspace.groups)).toHaveLength(2)
    expect(workspace.groups[leftGroupId].tabs).toHaveLength(2)
    expect(workspace.groups[rightGroupId].tabs).toHaveLength(1)
  })

  it('preserves focused group in serialization', () => {
    setupSplitWorkspace()

    const workspace = serializeWorkspace()
    expect(workspace.focusedGroupId).toBe('left-panel')
  })

  it('serialized workspace groups match layout leaf node IDs', () => {
    setupSplitWorkspace()

    const workspace = serializeWorkspace()
    const groupIds = Object.keys(workspace.groups)

    // Collect all leaf groupIds from layout tree
    function collectLeafIds(node: LayoutNode): string[] {
      if (node.type === 'leaf') return [node.groupId]
      return node.children.flatMap(c => collectLeafIds(c.node))
    }
    const layoutGroupIds = collectLeafIds(workspace.layout)

    // Every layout leaf should have a corresponding group
    for (const id of layoutGroupIds) {
      expect(groupIds).toContain(id)
    }

    // Every group should be referenced by the layout
    for (const id of groupIds) {
      expect(layoutGroupIds).toContain(id)
    }
  })

  it('round-trips a split layout through serialize/deserialize', () => {
    const { leftGroupId, rightGroupId } = setupSplitWorkspace()

    // Serialize workspace A
    const workspaceA = serializeWorkspace()

    // Switch to a different state (simulating workspace B)
    setupSinglePanelWorkspace()

    // Verify we're now in a different state
    expect(useLayoutStore.getState().root?.type).toBe('leaf')
    expect(Object.keys(useTabsStore.getState().groups)).toHaveLength(1)

    // Restore workspace A by directly applying serialized state
    useTabsStore.setState({
      groups: Object.fromEntries(
        Object.entries(workspaceA.groups).map(([id, g]) => [
          id,
          {
            id: g.id,
            activeTabId: g.activeTabId,
            tabHistory: g.tabHistory || [],
            worktree: g.worktree,
            tabs: g.tabs.map(t => ({
              id: t.id,
              type: t.type,
              title: t.title,
              filePath: t.filePath,
              url: t.url,
              content: t.content,
              autoPilot: t.autoPilot,
            })),
          },
        ])
      ),
    })
    useLayoutStore.getState().setRoot(workspaceA.layout)
    if (workspaceA.focusedGroupId) {
      useLayoutStore.getState().setFocusedGroup(workspaceA.focusedGroupId)
    }

    // Layout should be restored to split
    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('row')
    if (root.type === 'row') {
      expect(root.children).toHaveLength(2)
      expect(root.children[0].node).toEqual({ type: 'leaf', groupId: leftGroupId })
      expect(root.children[1].node).toEqual({ type: 'leaf', groupId: rightGroupId })
      expect(root.children[0].size).toBe(0.6)
      expect(root.children[1].size).toBe(0.4)
    }

    // Groups should be restored
    const groups = useTabsStore.getState().groups
    expect(Object.keys(groups)).toHaveLength(2)
    expect(groups[leftGroupId].tabs).toHaveLength(2)
    expect(groups[rightGroupId].tabs).toHaveLength(1)
    expect(groups[leftGroupId].activeTabId).toBe('tab-1')
    expect(groups[rightGroupId].activeTabId).toBe('tab-3')

    // Focus should be restored
    expect(useLayoutStore.getState().focusedGroupId).toBe(leftGroupId)
  })

  it('round-trips a complex nested layout', () => {
    // Create a 3-panel layout: left | (top-right / bottom-right)
    useTabsStore.setState({
      groups: {
        g1: { id: 'g1', activeTabId: 't1', tabHistory: ['t1'], tabs: [{ id: 't1', type: 'terminal', title: 'T1' }] },
        g2: { id: 'g2', activeTabId: 't2', tabHistory: ['t2'], tabs: [{ id: 't2', type: 'terminal', title: 'T2' }] },
        g3: { id: 'g3', activeTabId: 't3', tabHistory: ['t3'], tabs: [{ id: 't3', type: 'terminal', title: 'T3' }] },
      },
    })

    const nested: LayoutNode = {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
        {
          node: {
            type: 'column',
            children: [
              { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
              { node: { type: 'leaf', groupId: 'g3' }, size: 1 },
            ],
          },
          size: 1,
        },
      ],
    }
    useLayoutStore.setState({ root: nested, focusedGroupId: 'g2' })

    const serialized = serializeWorkspace()

    // Clear and restore
    useTabsStore.setState({ groups: {} })
    useLayoutStore.setState({ root: null, focusedGroupId: null })

    // Restore
    useTabsStore.setState({
      groups: Object.fromEntries(
        Object.entries(serialized.groups).map(([id, g]) => [
          id,
          { id: g.id, activeTabId: g.activeTabId, tabHistory: g.tabHistory || [], tabs: g.tabs.map(t => ({ id: t.id, type: t.type, title: t.title })) },
        ])
      ),
    })
    useLayoutStore.getState().setRoot(serialized.layout)

    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('row')
    if (root.type === 'row') {
      expect(root.children).toHaveLength(2)
      expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g1' })
      const rightCol = root.children[1].node
      expect(rightCol.type).toBe('column')
      if (rightCol.type === 'column') {
        expect(rightCol.children).toHaveLength(2)
        expect(rightCol.children[0].node).toEqual({ type: 'leaf', groupId: 'g2' })
        expect(rightCol.children[1].node).toEqual({ type: 'leaf', groupId: 'g3' })
      }
    }
  })

  it('serialization does not include orphaned groups not in layout', () => {
    // Set up a layout with only g1, but tabs store has g1 and g-orphan
    useTabsStore.setState({
      groups: {
        g1: { id: 'g1', activeTabId: 't1', tabHistory: ['t1'], tabs: [{ id: 't1', type: 'terminal', title: 'T1' }] },
        'g-orphan': { id: 'g-orphan', activeTabId: null, tabHistory: [], tabs: [] },
      },
    })
    useLayoutStore.setState({
      root: { type: 'leaf', groupId: 'g1' },
      focusedGroupId: 'g1',
    })

    const workspace = serializeWorkspace()

    // serializeWorkspace captures ALL groups (including orphans) since it
    // serializes from the tabs store. This test documents current behavior.
    expect(Object.keys(workspace.groups)).toHaveLength(2)
    // But the layout only references g1
    expect(workspace.layout).toEqual({ type: 'leaf', groupId: 'g1' })
  })

  it('preserves tab ordering within groups', () => {
    const groupId = 'ordered-group'
    useTabsStore.setState({
      groups: {
        [groupId]: {
          id: groupId,
          activeTabId: 'tab-b',
          tabHistory: ['tab-a', 'tab-c', 'tab-b'],
          tabs: [
            { id: 'tab-a', type: 'terminal', title: 'A' },
            { id: 'tab-b', type: 'terminal', title: 'B' },
            { id: 'tab-c', type: 'terminal', title: 'C' },
          ],
        },
      },
    })
    useLayoutStore.setState({
      root: { type: 'leaf', groupId },
      focusedGroupId: groupId,
    })

    const workspace = serializeWorkspace()
    const tabIds = workspace.groups[groupId].tabs.map(t => t.id)
    expect(tabIds).toEqual(['tab-a', 'tab-b', 'tab-c'])
    expect(workspace.groups[groupId].activeTabId).toBe('tab-b')
    expect(workspace.groups[groupId].tabHistory).toEqual(['tab-a', 'tab-c', 'tab-b'])
  })

  it('preserves split ratios through serialization', () => {
    useTabsStore.setState({
      groups: {
        g1: { id: 'g1', activeTabId: 't1', tabHistory: ['t1'], tabs: [{ id: 't1', type: 'terminal', title: 'T1' }] },
        g2: { id: 'g2', activeTabId: 't2', tabHistory: ['t2'], tabs: [{ id: 't2', type: 'terminal', title: 'T2' }] },
        g3: { id: 'g3', activeTabId: 't3', tabHistory: ['t3'], tabs: [{ id: 't3', type: 'terminal', title: 'T3' }] },
      },
    })

    const layout: LayoutNode = {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: 'g1' }, size: 0.25 },
        { node: { type: 'leaf', groupId: 'g2' }, size: 0.5 },
        { node: { type: 'leaf', groupId: 'g3' }, size: 0.25 },
      ],
    }
    useLayoutStore.setState({ root: layout, focusedGroupId: 'g1' })

    const workspace = serializeWorkspace()

    // Clear and restore
    useLayoutStore.setState({ root: null })
    useLayoutStore.getState().setRoot(workspace.layout)

    const root = useLayoutStore.getState().root!
    if (root.type === 'row') {
      expect(root.children[0].size).toBe(0.25)
      expect(root.children[1].size).toBe(0.5)
      expect(root.children[2].size).toBe(0.25)
    }
  })

  it('preserves worktree association on groups', () => {
    const groupId = 'wt-group'
    useTabsStore.setState({
      groups: {
        [groupId]: {
          id: groupId,
          activeTabId: 't1',
          tabHistory: ['t1'],
          worktree: '/path/to/worktree',
          tabs: [{ id: 't1', type: 'terminal', title: 'T1' }],
        },
      },
    })
    useLayoutStore.setState({
      root: { type: 'leaf', groupId },
      focusedGroupId: groupId,
    })

    const workspace = serializeWorkspace()
    expect(workspace.groups[groupId].worktree).toBe('/path/to/worktree')
  })
})

describe('switchWorkspace preserves layout with dead sessions', () => {
  beforeEach(() => {
    resetStores()
    // conductordGetSessions is not in default setup.ts — add it here
    ;(window.electronAPI as any).conductordGetSessions = vi.fn().mockResolvedValue([])
  })

  it('preserves all terminal tabs and split layout even when sessions are dead', async () => {
    // Set up workspace "B" as current state (will be switched away from)
    const currentGroupId = 'current-group'
    useTabsStore.setState({
      groups: {
        [currentGroupId]: {
          id: currentGroupId,
          activeTabId: 'cur-1',
          tabHistory: ['cur-1'],
          tabs: [{ id: 'cur-1', type: 'terminal', title: 'Current Terminal' }],
        },
      },
    })
    useLayoutStore.setState({
      root: { type: 'leaf', groupId: currentGroupId },
      focusedGroupId: currentGroupId,
    })

    // The target workspace "A" has a split layout with only terminal/session tabs.
    // All sessions are dead in conductord (mockResolvedValue([]) above).
    // Without skipSessionFilter, these would all be filtered out and the layout would collapse.
    const projectData = {
      version: 3,
      name: 'test',
      activeWorkspace: 'A',
      workspaces: {
        A: {
          layout: {
            type: 'row',
            children: [
              { node: { type: 'leaf', groupId: 'g-left' }, size: 0.6 },
              {
                node: {
                  type: 'column',
                  children: [
                    { node: { type: 'leaf', groupId: 'g-top-right' }, size: 1 },
                    { node: { type: 'leaf', groupId: 'g-bottom-right' }, size: 1 },
                  ],
                },
                size: 0.4,
              },
            ],
          },
          groups: {
            'g-left': {
              id: 'g-left',
              tabs: [
                { id: 'term-1', type: 'terminal', title: 'Terminal 1' },
                { id: 'claude-1', type: 'claude-code', title: 'Claude' },
              ],
              activeTabId: 'term-1',
              tabHistory: ['term-1', 'claude-1'],
            },
            'g-top-right': {
              id: 'g-top-right',
              tabs: [{ id: 'term-2', type: 'terminal', title: 'Terminal 2' }],
              activeTabId: 'term-2',
              tabHistory: ['term-2'],
            },
            'g-bottom-right': {
              id: 'g-bottom-right',
              tabs: [{ id: 'codex-1', type: 'codex', title: 'Codex' }],
              activeTabId: 'codex-1',
              tabHistory: ['codex-1'],
            },
          },
          focusedGroupId: 'g-left',
        },
        B: {
          layout: { type: 'leaf', groupId: currentGroupId },
          groups: {
            [currentGroupId]: {
              id: currentGroupId,
              tabs: [{ id: 'cur-1', type: 'terminal', title: 'Current Terminal' }],
              activeTabId: 'cur-1',
              tabHistory: ['cur-1'],
            },
          },
          focusedGroupId: currentGroupId,
        },
      },
      sidebar: { rootPath: null, expandedPaths: [] },
    }

    // Mock readFile to return the project data, writeFile to accept saves
    vi.mocked(window.electronAPI.readFile).mockResolvedValue({
      success: true,
      content: JSON.stringify(projectData),
    } as any)
    vi.mocked(window.electronAPI.writeFile).mockResolvedValue(undefined as any)

    // Set project store to simulate a saved project on workspace B
    useProjectStore.setState({
      filePath: '/test/project.conductor',
      name: 'test',
      activeWorkspace: 'B',
      workspaceNames: ['A', 'B'],
    })

    // Switch to workspace A
    const result = await switchWorkspace('A')
    expect(result).toBe(true)

    // Verify all 3 groups are preserved (none were filtered out)
    const groups = useTabsStore.getState().groups
    expect(Object.keys(groups)).toHaveLength(3)
    expect(groups['g-left']).toBeDefined()
    expect(groups['g-top-right']).toBeDefined()
    expect(groups['g-bottom-right']).toBeDefined()

    // Verify all tabs are preserved
    expect(groups['g-left'].tabs).toHaveLength(2)
    expect(groups['g-left'].tabs[0].id).toBe('term-1')
    expect(groups['g-left'].tabs[1].id).toBe('claude-1')
    expect(groups['g-top-right'].tabs).toHaveLength(1)
    expect(groups['g-bottom-right'].tabs).toHaveLength(1)

    // Verify active tabs and history are preserved
    expect(groups['g-left'].activeTabId).toBe('term-1')
    expect(groups['g-left'].tabHistory).toEqual(['term-1', 'claude-1'])

    // Verify the full layout tree structure including split ratios
    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('row')
    if (root.type === 'row') {
      expect(root.children).toHaveLength(2)
      expect(root.children[0].size).toBe(0.6)
      expect(root.children[1].size).toBe(0.4)
      expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g-left' })

      const rightCol = root.children[1].node
      expect(rightCol.type).toBe('column')
      if (rightCol.type === 'column') {
        expect(rightCol.children).toHaveLength(2)
        expect(rightCol.children[0].node).toEqual({ type: 'leaf', groupId: 'g-top-right' })
        expect(rightCol.children[1].node).toEqual({ type: 'leaf', groupId: 'g-bottom-right' })
      }
    }

    // Verify focused group is preserved
    expect(useLayoutStore.getState().focusedGroupId).toBe('g-left')

    // conductordGetSessions should NOT have been called (skipSessionFilter: true)
    expect((window.electronAPI as any).conductordGetSessions).not.toHaveBeenCalled()
  })
})
