import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore, type LayoutNode } from '../store/layout'

function resetStore() {
  useLayoutStore.setState({ root: null, focusedGroupId: null })
}

describe('replaceLeaf', () => {
  beforeEach(resetStore)

  it('replaces a root leaf with a subtree', () => {
    useLayoutStore.getState().setRoot({ type: 'leaf', groupId: 'g1' })

    const replacement: LayoutNode = {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
        { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
      ],
    }
    useLayoutStore.getState().replaceLeaf('g1', replacement)

    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('row')
    if (root.type === 'row') {
      expect(root.children).toHaveLength(2)
      expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g1' })
      expect(root.children[1].node).toEqual({ type: 'leaf', groupId: 'g2' })
    }
  })

  it('replaces a nested leaf within a container', () => {
    const initial: LayoutNode = {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
        { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
      ],
    }
    useLayoutStore.getState().setRoot(initial)

    const replacement: LayoutNode = {
      type: 'column',
      children: [
        { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        { node: { type: 'leaf', groupId: 'g3' }, size: 1 },
      ],
    }
    useLayoutStore.getState().replaceLeaf('g2', replacement)

    const root = useLayoutStore.getState().root!
    expect(root.type).toBe('row')
    if (root.type === 'row') {
      expect(root.children).toHaveLength(2)
      expect(root.children[0].node).toEqual({ type: 'leaf', groupId: 'g1' })
      const nested = root.children[1].node
      expect(nested.type).toBe('column')
      if (nested.type === 'column') {
        expect(nested.children).toHaveLength(2)
        expect(nested.children[0].node).toEqual({ type: 'leaf', groupId: 'g2' })
        expect(nested.children[1].node).toEqual({ type: 'leaf', groupId: 'g3' })
      }
    }
  })

  it('does nothing if target groupId is not found', () => {
    const initial: LayoutNode = { type: 'leaf', groupId: 'g1' }
    useLayoutStore.getState().setRoot(initial)

    useLayoutStore.getState().replaceLeaf('nonexistent', {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: 'a' }, size: 1 },
        { node: { type: 'leaf', groupId: 'b' }, size: 1 },
      ],
    })

    expect(useLayoutStore.getState().root).toEqual({ type: 'leaf', groupId: 'g1' })
  })

  it('does nothing when root is null', () => {
    useLayoutStore.getState().replaceLeaf('g1', { type: 'leaf', groupId: 'g2' })
    expect(useLayoutStore.getState().root).toBeNull()
  })

  it('simplifies same-direction nesting after replacement', () => {
    // Start with a row containing two leaves
    const initial: LayoutNode = {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
        { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
      ],
    }
    useLayoutStore.getState().setRoot(initial)

    // Replace g2 with a row (same direction as parent) — should be flattened
    const replacement: LayoutNode = {
      type: 'row',
      children: [
        { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        { node: { type: 'leaf', groupId: 'g3' }, size: 1 },
      ],
    }
    useLayoutStore.getState().replaceLeaf('g2', replacement)

    const root = useLayoutStore.getState().root!
    // The simplify function should flatten nested same-direction containers
    expect(root.type).toBe('row')
    if (root.type === 'row') {
      expect(root.children).toHaveLength(3)
    }
  })
})
