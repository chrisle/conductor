import { describe, it, expect } from 'vitest'
import { buildTileLayout } from '../lib/tile-layout'
import type { LayoutNode } from '../store/layout'

describe('buildTileLayout', () => {
  it('returns a single leaf for one group', () => {
    const tree = buildTileLayout(['g1'], 'columns')
    expect(tree).toEqual({ type: 'leaf', groupId: 'g1' })
  })

  describe('columns mode', () => {
    it('arranges groups in a single row', () => {
      const tree = buildTileLayout(['g1', 'g2', 'g3'], 'columns')
      expect(tree.type).toBe('row')
      if (tree.type === 'row') {
        expect(tree.children).toHaveLength(3)
        expect(tree.children[0]).toEqual({ node: { type: 'leaf', groupId: 'g1' }, size: 1 })
        expect(tree.children[1]).toEqual({ node: { type: 'leaf', groupId: 'g2' }, size: 1 })
        expect(tree.children[2]).toEqual({ node: { type: 'leaf', groupId: 'g3' }, size: 1 })
      }
    })

    it('creates equal-size children', () => {
      const tree = buildTileLayout(['g1', 'g2', 'g3', 'g4'], 'columns')
      if (tree.type === 'row') {
        expect(tree.children.every(c => c.size === 1)).toBe(true)
      }
    })
  })

  describe('rows mode', () => {
    it('arranges groups in a single column', () => {
      const tree = buildTileLayout(['g1', 'g2', 'g3'], 'rows')
      expect(tree.type).toBe('column')
      if (tree.type === 'column') {
        expect(tree.children).toHaveLength(3)
        expect(tree.children[0]).toEqual({ node: { type: 'leaf', groupId: 'g1' }, size: 1 })
        expect(tree.children[1]).toEqual({ node: { type: 'leaf', groupId: 'g2' }, size: 1 })
        expect(tree.children[2]).toEqual({ node: { type: 'leaf', groupId: 'g3' }, size: 1 })
      }
    })
  })

  describe('grid mode', () => {
    it('creates a 2x2 grid for 4 groups (ceil(sqrt(4))=2 cols)', () => {
      const tree = buildTileLayout(['g1', 'g2', 'g3', 'g4'], 'grid')
      // 4 groups → ceil(sqrt(4)) = 2 cols → 2 rows of 2
      expect(tree.type).toBe('column')
      if (tree.type === 'column') {
        expect(tree.children).toHaveLength(2)
        // Each row is a row container with 2 leaves
        const row1 = tree.children[0].node
        const row2 = tree.children[1].node
        expect(row1.type).toBe('row')
        expect(row2.type).toBe('row')
        if (row1.type === 'row' && row2.type === 'row') {
          expect(row1.children).toHaveLength(2)
          expect(row2.children).toHaveLength(2)
          expect(row1.children[0].node).toEqual({ type: 'leaf', groupId: 'g1' })
          expect(row1.children[1].node).toEqual({ type: 'leaf', groupId: 'g2' })
          expect(row2.children[0].node).toEqual({ type: 'leaf', groupId: 'g3' })
          expect(row2.children[1].node).toEqual({ type: 'leaf', groupId: 'g4' })
        }
      }
    })

    it('creates a 3x2 grid for 6 groups (ceil(sqrt(6))=3 cols)', () => {
      const tree = buildTileLayout(['g1', 'g2', 'g3', 'g4', 'g5', 'g6'], 'grid')
      // 6 groups → ceil(sqrt(6)) = 3 cols → 2 rows of 3
      expect(tree.type).toBe('column')
      if (tree.type === 'column') {
        expect(tree.children).toHaveLength(2)
        const row1 = tree.children[0].node
        const row2 = tree.children[1].node
        expect(row1.type).toBe('row')
        expect(row2.type).toBe('row')
        if (row1.type === 'row' && row2.type === 'row') {
          expect(row1.children).toHaveLength(3)
          expect(row2.children).toHaveLength(3)
        }
      }
    })

    it('handles uneven grid (5 groups → 3 cols, rows of 3 then 2)', () => {
      const tree = buildTileLayout(['g1', 'g2', 'g3', 'g4', 'g5'], 'grid')
      // 5 groups → ceil(sqrt(5)) = 3 cols → row of 3, row of 2
      expect(tree.type).toBe('column')
      if (tree.type === 'column') {
        expect(tree.children).toHaveLength(2)
        const row1 = tree.children[0].node
        const row2 = tree.children[1].node
        expect(row1.type).toBe('row')
        expect(row2.type).toBe('row')
        if (row1.type === 'row' && row2.type === 'row') {
          expect(row1.children).toHaveLength(3)
          expect(row2.children).toHaveLength(2)
        }
      }
    })

    it('handles 2 groups as a single row (grid collapses to row)', () => {
      const tree = buildTileLayout(['g1', 'g2'], 'grid')
      // 2 groups → ceil(sqrt(2)) = 2 cols → 1 row of 2 → unwrapped to just a row
      expect(tree.type).toBe('row')
      if (tree.type === 'row') {
        expect(tree.children).toHaveLength(2)
      }
    })

    it('handles 3 groups as a column with a row and a leaf', () => {
      const tree = buildTileLayout(['g1', 'g2', 'g3'], 'grid')
      // 3 groups → ceil(sqrt(3)) = 2 cols → row of [g1, g2], then single g3
      expect(tree.type).toBe('column')
      if (tree.type === 'column') {
        expect(tree.children).toHaveLength(2)
        const row1 = tree.children[0].node
        expect(row1.type).toBe('row')
        // Single item in last row becomes a leaf
        const leaf = tree.children[1].node
        expect(leaf).toEqual({ type: 'leaf', groupId: 'g3' })
      }
    })
  })
})
