import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore, type LayoutNode, migrateLayout } from '../store/layout'

function resetStore() {
  useLayoutStore.setState({ root: null, focusedGroupId: null })
}

describe('useLayoutStore', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('setRoot', () => {
    it('sets the root layout node', () => {
      const leaf: LayoutNode = { type: 'leaf', groupId: 'g1' }
      useLayoutStore.getState().setRoot(leaf)
      expect(useLayoutStore.getState().root).toEqual(leaf)
    })
  })

  describe('setFocusedGroup', () => {
    it('sets the focused group id', () => {
      useLayoutStore.getState().setFocusedGroup('g1')
      expect(useLayoutStore.getState().focusedGroupId).toBe('g1')
    })
  })

  describe('insertPanel', () => {
    it('wraps a leaf in a row when inserting east', () => {
      useLayoutStore.getState().setRoot({ type: 'leaf', groupId: 'g1' })
      useLayoutStore.getState().insertPanel('g1', 'east', 'g2')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('row')
      if (root.type === 'row') {
        expect(root.children).toHaveLength(2)
        expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g1' })
        expect(root.children[1].node).toEqual({ type: 'leaf', groupId: 'g2' })
      }
    })

    it('wraps a leaf in a column when inserting south', () => {
      useLayoutStore.getState().setRoot({ type: 'leaf', groupId: 'g1' })
      useLayoutStore.getState().insertPanel('g1', 'south', 'g2')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('column')
      if (root.type === 'column') {
        expect(root.children).toHaveLength(2)
        expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g1' })
        expect(root.children[1].node).toEqual({ type: 'leaf', groupId: 'g2' })
      }
    })

    it('inserts west (before) into existing row flatly', () => {
      const initial: LayoutNode = {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().insertPanel('g1', 'west', 'g3')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('row')
      if (root.type === 'row') {
        expect(root.children).toHaveLength(3)
        expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g3' })
        expect(root.children[1].node).toEqual({ type: 'leaf', groupId: 'g1' })
        expect(root.children[2].node).toEqual({ type: 'leaf', groupId: 'g2' })
      }
    })

    it('inserts east (after) into existing row flatly', () => {
      const initial: LayoutNode = {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().insertPanel('g1', 'east', 'g3')

      const root = useLayoutStore.getState().root!
      expect (root.type).toBe('row')
      if (root.type === 'row') {
        expect(root.children).toHaveLength(3)
        expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g1' })
        expect(root.children[1].node).toEqual({ type: 'leaf', groupId: 'g3' })
        expect(root.children[2].node).toEqual({ type: 'leaf', groupId: 'g2' })
      }
    })

    it('wraps target in column when inserting north into a row child', () => {
      const initial: LayoutNode = {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().insertPanel('g2', 'north', 'g3')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('row')
      if (root.type === 'row') {
        expect(root.children).toHaveLength(2)
        const secondChild = root.children[1].node
        expect(secondChild.type).toBe('column')
        if (secondChild.type === 'column') {
          expect(secondChild.children[0].node).toEqual({ type: 'leaf', groupId: 'g3' })
          expect(secondChild.children[1].node).toEqual({ type: 'leaf', groupId: 'g2' })
        }
      }
    })
  })

  describe('insertAtEdge', () => {
    it('prepends to root when inserting at west edge', () => {
      useLayoutStore.getState().setRoot({ type: 'leaf', groupId: 'g1' })
      useLayoutStore.getState().insertAtEdge('west', 'g2')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('row')
      if (root.type === 'row') {
        expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g2' })
        expect(root.children[1].node).toEqual({ type: 'leaf', groupId: 'g1' })
      }
    })

    it('appends to existing row when inserting at east edge', () => {
      const initial: LayoutNode = {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().insertAtEdge('east', 'g3')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('row')
      if (root.type === 'row') {
        expect(root.children).toHaveLength(3)
        expect(root.children[2].node).toEqual({ type: 'leaf', groupId: 'g3' })
      }
    })

    it('prepends to root when inserting at north edge', () => {
      useLayoutStore.getState().setRoot({ type: 'leaf', groupId: 'g1' })
      useLayoutStore.getState().insertAtEdge('north', 'g2')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('column')
      if (root.type === 'column') {
        expect(root.children).toHaveLength(2)
        expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g2' })
        expect(root.children[1].node).toEqual({ type: 'leaf', groupId: 'g1' })
      }
    })

    it('appends to root when inserting at south edge', () => {
      useLayoutStore.getState().setRoot({ type: 'leaf', groupId: 'g1' })
      useLayoutStore.getState().insertAtEdge('south', 'g2')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('column')
      if (root.type === 'column') {
        expect(root.children).toHaveLength(2)
        expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g1' })
        expect(root.children[1].node).toEqual({ type: 'leaf', groupId: 'g2' })
      }
    })

    it('prepends to existing column when inserting at north edge', () => {
      const initial: LayoutNode = {
        type: 'column',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().insertAtEdge('north', 'g3')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('column')
      if (root.type === 'column') {
        expect(root.children).toHaveLength(3)
        expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g3' })
        expect(root.children[1].node).toEqual({ type: 'leaf', groupId: 'g1' })
        expect(root.children[2].node).toEqual({ type: 'leaf', groupId: 'g2' })
      }
    })

    it('appends to existing column when inserting at south edge', () => {
      const initial: LayoutNode = {
        type: 'column',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().insertAtEdge('south', 'g3')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('column')
      if (root.type === 'column') {
        expect(root.children).toHaveLength(3)
        expect(root.children[2].node).toEqual({ type: 'leaf', groupId: 'g3' })
      }
    })

    it('wraps row root in column when inserting at north edge', () => {
      const initial: LayoutNode = {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().insertAtEdge('north', 'g3')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('column')
      if (root.type === 'column') {
        expect(root.children).toHaveLength(2)
        // First child is the new panel
        expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g3' })
        // Second child is the original row
        expect(root.children[1].node.type).toBe('row')
      }
    })

    it('wraps column root in row when inserting at east edge', () => {
      const initial: LayoutNode = {
        type: 'column',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().insertAtEdge('east', 'g3')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('row')
      if (root.type === 'row') {
        expect(root.children).toHaveLength(2)
        // First child is the original column
        expect(root.children[0].node.type).toBe('column')
        // Second child is the new panel
        expect(root.children[1].node).toEqual({ type: 'leaf', groupId: 'g3' })
      }
    })
  })

  describe('removeGroup', () => {
    it('removes a group and promotes the sibling', () => {
      const initial: LayoutNode = {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().removeGroup('g2')

      expect(useLayoutStore.getState().root).toEqual({ type: 'leaf', groupId: 'g1' })
    })

    it('sets root to null when removing the only leaf', () => {
      useLayoutStore.getState().setRoot({ type: 'leaf', groupId: 'g1' })
      useLayoutStore.getState().removeGroup('g1')
      expect(useLayoutStore.getState().root).toBeNull()
    })

    it('preserves other nodes when removing from flat row', () => {
      const initial: LayoutNode = {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g3' }, size: 1 },
        ],
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().removeGroup('g2')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('row')
      if (root.type === 'row') {
        expect(root.children).toHaveLength(2)
        expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g1' })
        expect(root.children[1].node).toEqual({ type: 'leaf', groupId: 'g3' })
      }
    })
  })

  describe('setSizes', () => {
    it('updates sizes for a container holding the target group', () => {
      const initial: LayoutNode = {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().setSizes('g1', [0.7, 0.3])

      const root = useLayoutStore.getState().root!
      if (root.type === 'row') {
        expect(root.children[0].size).toBe(0.7)
        expect(root.children[1].size).toBe(0.3)
      }
    })
  })

  describe('getAllGroupIds', () => {
    it('returns empty array when root is null', () => {
      expect(useLayoutStore.getState().getAllGroupIds()).toEqual([])
    })

    it('returns all group ids from the tree', () => {
      const tree: LayoutNode = {
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
      useLayoutStore.getState().setRoot(tree)
      expect(useLayoutStore.getState().getAllGroupIds()).toEqual(['g1', 'g2', 'g3'])
    })
  })

  describe('migrateLayout', () => {
    it('converts old binary split format to new N-ary format', () => {
      const oldFormat = {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { type: 'leaf', groupId: 'g1' },
        second: { type: 'leaf', groupId: 'g2' },
      }
      const result = migrateLayout(oldFormat)
      expect(result.type).toBe('row')
      if (result.type === 'row') {
        expect(result.children).toHaveLength(2)
        expect(result.children[0].node).toEqual({ type: 'leaf', groupId: 'g1' })
        expect(result.children[1].node).toEqual({ type: 'leaf', groupId: 'g2' })
      }
    })

    it('converts nested old format and flattens same-direction', () => {
      const oldFormat = {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { type: 'leaf', groupId: 'g1' },
        second: {
          type: 'split',
          direction: 'horizontal',
          ratio: 0.5,
          first: { type: 'leaf', groupId: 'g2' },
          second: { type: 'leaf', groupId: 'g3' },
        },
      }
      const result = migrateLayout(oldFormat)
      expect(result.type).toBe('row')
      if (result.type === 'row') {
        // Should be flattened to 3 children, not nested
        expect(result.children).toHaveLength(3)
        expect(result.children[0].node).toEqual({ type: 'leaf', groupId: 'g1' })
        expect(result.children[1].node).toEqual({ type: 'leaf', groupId: 'g2' })
        expect(result.children[2].node).toEqual({ type: 'leaf', groupId: 'g3' })
      }
    })

    it('passes through new format unchanged', () => {
      const newFormat: LayoutNode = {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      }
      const result = migrateLayout(newFormat)
      expect(result).toEqual(newFormat)
    })
  })

  // Legacy compat
  describe('splitGroup (legacy)', () => {
    it('works as insertPanel east', () => {
      useLayoutStore.getState().setRoot({ type: 'leaf', groupId: 'g1' })
      useLayoutStore.getState().splitGroup('g1', 'horizontal', 'g2')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('row')
      if (root.type === 'row') {
        expect(root.children).toHaveLength(2)
        expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g1' })
        expect(root.children[1].node).toEqual({ type: 'leaf', groupId: 'g2' })
      }
    })
  })

  describe('setRatio (legacy)', () => {
    it('updates sizes using ratio', () => {
      const initial: LayoutNode = {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().setRatio('g1', 0.7)

      const root = useLayoutStore.getState().root!
      if (root.type === 'row') {
        expect(root.children[0].size).toBeCloseTo(0.7)
        expect(root.children[1].size).toBeCloseTo(0.3)
      }
    })
  })
})
