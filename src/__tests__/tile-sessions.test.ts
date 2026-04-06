import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore, type LayoutNode } from '../store/layout'
import { useTabsStore } from '../store/tabs'
import { buildTileTree, tileSessions } from '../extensions/work-sessions/WorkSessionsSidebar'

// Reset stores to a clean state before each test
function resetStores() {
  useLayoutStore.setState({ root: null, focusedGroupId: null })
  useTabsStore.setState({ groups: {}, selectedTabIds: {}, selectionAnchor: {} })
}

describe('buildTileTree', () => {
  it('returns a single leaf for one id', () => {
    const tree = buildTileTree(['g1'], 0)
    expect(tree).toEqual({ type: 'leaf', groupId: 'g1' })
  })

  it('returns a row container at even depth', () => {
    const tree = buildTileTree(['g1', 'g2'], 0)
    expect(tree.type).toBe('row')
    if (tree.type === 'row') {
      expect(tree.children).toHaveLength(2)
      expect(tree.children[0]).toEqual({ node: { type: 'leaf', groupId: 'g1' }, size: 1 })
      expect(tree.children[1]).toEqual({ node: { type: 'leaf', groupId: 'g2' }, size: 1 })
    }
  })

  it('returns a column container at odd depth', () => {
    const tree = buildTileTree(['g1', 'g2'], 1)
    expect(tree.type).toBe('column')
    if (tree.type === 'column') {
      expect(tree.children).toHaveLength(2)
    }
  })

  it('creates equal-size children for 3 sessions', () => {
    const tree = buildTileTree(['g1', 'g2', 'g3'], 0)
    expect(tree.type).toBe('row')
    if (tree.type === 'row') {
      expect(tree.children).toHaveLength(3)
      expect(tree.children.every(c => c.size === 1)).toBe(true)
    }
  })
})

describe('tileSessions', () => {
  beforeEach(() => {
    resetStores()
  })

  it('does nothing when sessions array is empty', () => {
    const leaf: LayoutNode = { type: 'leaf', groupId: 'existing' }
    useLayoutStore.getState().setRoot(leaf)

    tileSessions([])

    // Root should be unchanged
    expect(useLayoutStore.getState().root).toEqual(leaf)
  })

  it('does nothing when no root layout exists', () => {
    // root is null
    tileSessions([
      { session: { name: 'sess1', connected: true, command: 'bash', cwd: '/' }, workSession: null, ticketKey: null, hasOpenTab: true },
    ])

    expect(useLayoutStore.getState().root).toBeNull()
  })

  it('tiles two sessions with open tabs into a row beside the existing layout', () => {
    // Set up: existing layout with a single group containing two tabs (sessions)
    const existingGroupId = 'existing-group'
    useTabsStore.setState({
      groups: {
        [existingGroupId]: {
          id: existingGroupId,
          tabs: [
            { id: 'sess1', type: 'terminal', title: 'Session 1' },
            { id: 'sess2', type: 'terminal', title: 'Session 2' },
          ],
          activeTabId: 'sess1',
          tabHistory: ['sess1', 'sess2'],
        },
      },
      selectedTabIds: {},
      selectionAnchor: {},
    })

    const existingRoot: LayoutNode = { type: 'leaf', groupId: existingGroupId }
    useLayoutStore.getState().setRoot(existingRoot)

    const sessions = [
      { session: { name: 'sess1', connected: true, command: 'bash', cwd: '/' }, workSession: null, ticketKey: null, hasOpenTab: true },
      { session: { name: 'sess2', connected: true, command: 'bash', cwd: '/' }, workSession: null, ticketKey: null, hasOpenTab: true },
    ]

    tileSessions(sessions)

    const root = useLayoutStore.getState().root!
    // Root should be a row with the tile tree on the left and existing layout on the right
    expect(root.type).toBe('row')
    if (root.type === 'row') {
      expect(root.children).toHaveLength(2)
      // First child is the tile tree (a row of 2 leaves)
      const tileNode = root.children[0].node
      expect(tileNode.type).toBe('row')
      // Second child is the original root
      // (the original group may still exist or be modified)
    }
  })

  it('skips sessions without open tabs (no matching tab in any group)', () => {
    const existingGroupId = 'existing-group'
    useTabsStore.setState({
      groups: {
        [existingGroupId]: {
          id: existingGroupId,
          tabs: [
            { id: 'sess1', type: 'terminal', title: 'Session 1' },
          ],
          activeTabId: 'sess1',
          tabHistory: ['sess1'],
        },
      },
      selectedTabIds: {},
      selectionAnchor: {},
    })

    const existingRoot: LayoutNode = { type: 'leaf', groupId: existingGroupId }
    useLayoutStore.getState().setRoot(existingRoot)

    // sess2 has no open tab (not in any group)
    const sessions = [
      { session: { name: 'sess1', connected: true, command: 'bash', cwd: '/' }, workSession: null, ticketKey: null, hasOpenTab: true },
      { session: { name: 'sess2', connected: true, command: 'bash', cwd: '/' }, workSession: null, ticketKey: null, hasOpenTab: false },
    ]

    tileSessions(sessions)

    const root = useLayoutStore.getState().root!
    // Should still tile since sess1 has an open tab and gets moved to a new group
    expect(root.type).toBe('row')
    if (root.type === 'row') {
      expect(root.children).toHaveLength(2)
      // Tile tree has only 1 session, so it's a leaf
      const tileNode = root.children[0].node
      expect(tileNode.type).toBe('leaf')
    }
  })

  it('sets focused group to the first new group after tiling', () => {
    const existingGroupId = 'existing-group'
    useTabsStore.setState({
      groups: {
        [existingGroupId]: {
          id: existingGroupId,
          tabs: [
            { id: 'sess1', type: 'terminal', title: 'Session 1' },
          ],
          activeTabId: 'sess1',
          tabHistory: ['sess1'],
        },
      },
      selectedTabIds: {},
      selectionAnchor: {},
    })

    useLayoutStore.getState().setRoot({ type: 'leaf', groupId: existingGroupId })

    tileSessions([
      { session: { name: 'sess1', connected: true, command: 'bash', cwd: '/' }, workSession: null, ticketKey: null, hasOpenTab: true },
    ])

    // The focused group should be set to the new group (not the existing one)
    const focusedId = useLayoutStore.getState().focusedGroupId
    expect(focusedId).not.toBeNull()
    expect(focusedId).not.toBe(existingGroupId)
  })
})
