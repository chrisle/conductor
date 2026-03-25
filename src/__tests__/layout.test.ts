import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore, type LayoutNode } from '../store/layout'

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

  describe('splitGroup', () => {
    it('splits a leaf into a horizontal split', () => {
      useLayoutStore.getState().setRoot({ type: 'leaf', groupId: 'g1' })
      useLayoutStore.getState().splitGroup('g1', 'horizontal', 'g2')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('split')
      if (root.type === 'split') {
        expect(root.direction).toBe('horizontal')
        expect(root.ratio).toBe(0.5)
        expect(root.first).toEqual({ type: 'leaf', groupId: 'g1' })
        expect(root.second).toEqual({ type: 'leaf', groupId: 'g2' })
      }
    })

    it('splits a nested leaf correctly', () => {
      const initial: LayoutNode = {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { type: 'leaf', groupId: 'g1' },
        second: { type: 'leaf', groupId: 'g2' }
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().splitGroup('g2', 'vertical', 'g3')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('split')
      if (root.type === 'split') {
        expect(root.first).toEqual({ type: 'leaf', groupId: 'g1' })
        expect(root.second.type).toBe('split')
        if (root.second.type === 'split') {
          expect(root.second.direction).toBe('vertical')
          expect(root.second.first).toEqual({ type: 'leaf', groupId: 'g2' })
          expect(root.second.second).toEqual({ type: 'leaf', groupId: 'g3' })
        }
      }
    })

    it('does nothing when root is null', () => {
      useLayoutStore.getState().splitGroup('g1', 'horizontal', 'g2')
      expect(useLayoutStore.getState().root).toBeNull()
    })
  })

  describe('removeGroup', () => {
    it('removes a group and promotes the sibling', () => {
      const initial: LayoutNode = {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { type: 'leaf', groupId: 'g1' },
        second: { type: 'leaf', groupId: 'g2' }
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

    it('preserves other nodes when removing from deep tree', () => {
      const initial: LayoutNode = {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { type: 'leaf', groupId: 'g1' },
        second: {
          type: 'split',
          direction: 'vertical',
          ratio: 0.5,
          first: { type: 'leaf', groupId: 'g2' },
          second: { type: 'leaf', groupId: 'g3' }
        }
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().removeGroup('g2')

      const root = useLayoutStore.getState().root!
      expect(root.type).toBe('split')
      if (root.type === 'split') {
        expect(root.first).toEqual({ type: 'leaf', groupId: 'g1' })
        expect(root.second).toEqual({ type: 'leaf', groupId: 'g3' })
      }
    })
  })

  describe('setRatio', () => {
    it('updates ratio for a split containing the target group', () => {
      const initial: LayoutNode = {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { type: 'leaf', groupId: 'g1' },
        second: { type: 'leaf', groupId: 'g2' }
      }
      useLayoutStore.getState().setRoot(initial)
      useLayoutStore.getState().setRatio('g1', 0.7)

      const root = useLayoutStore.getState().root!
      if (root.type === 'split') {
        expect(root.ratio).toBe(0.7)
      }
    })
  })

  describe('getAllGroupIds', () => {
    it('returns empty array when root is null', () => {
      expect(useLayoutStore.getState().getAllGroupIds()).toEqual([])
    })

    it('returns all group ids from the tree', () => {
      const tree: LayoutNode = {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { type: 'leaf', groupId: 'g1' },
        second: {
          type: 'split',
          direction: 'vertical',
          ratio: 0.5,
          first: { type: 'leaf', groupId: 'g2' },
          second: { type: 'leaf', groupId: 'g3' }
        }
      }
      useLayoutStore.getState().setRoot(tree)
      expect(useLayoutStore.getState().getAllGroupIds()).toEqual(['g1', 'g2', 'g3'])
    })
  })
})
