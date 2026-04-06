import type { LayoutNode, LayoutChild } from '@/store/layout'

export type TileMode = 'columns' | 'rows' | 'grid'

/**
 * Build a layout tree that arranges groupIds according to the given tiling mode.
 *
 * - columns: all groups side-by-side in a single row
 * - rows:    all groups stacked in a single column
 * - grid:    groups distributed into a grid (ceil(sqrt(N)) columns per row)
 */
export function buildTileLayout(groupIds: string[], mode: TileMode): LayoutNode {
  if (groupIds.length === 1) return { type: 'leaf', groupId: groupIds[0] }

  const toChild = (id: string): LayoutChild => ({
    node: { type: 'leaf', groupId: id },
    size: 1,
  })

  switch (mode) {
    case 'columns':
      return { type: 'row', children: groupIds.map(toChild) }

    case 'rows':
      return { type: 'column', children: groupIds.map(toChild) }

    case 'grid': {
      const cols = Math.ceil(Math.sqrt(groupIds.length))
      const rows: LayoutChild[] = []
      for (let i = 0; i < groupIds.length; i += cols) {
        const chunk = groupIds.slice(i, i + cols)
        if (chunk.length === 1) {
          rows.push(toChild(chunk[0]))
        } else {
          rows.push({
            node: { type: 'row', children: chunk.map(toChild) },
            size: 1,
          })
        }
      }
      if (rows.length === 1) return rows[0].node
      return { type: 'column', children: rows }
    }
  }
}
