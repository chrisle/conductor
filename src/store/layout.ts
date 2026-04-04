import { create } from 'zustand'
import { nanoid } from '../lib/nanoid'

/**
 * Flat N-ary layout model.
 *
 * - A `leaf` is a single tab group.
 * - A `row` arranges children horizontally (east/west splits).
 * - A `column` arranges children vertically (north/south splits).
 *
 * When inserting in the same direction as the parent container we append to the
 * flat list instead of nesting, keeping the tree shallow.
 */

export type LayoutNode =
  | { type: 'leaf'; groupId: string }
  | { type: 'row'; children: LayoutChild[] }
  | { type: 'column'; children: LayoutChild[] }

export interface LayoutChild {
  node: LayoutNode
  size: number // flex ratio – equal = 1 each
}

export type DropPosition = 'north' | 'south' | 'east' | 'west'

export interface LayoutState {
  root: LayoutNode | null
  focusedGroupId: string | null
  setRoot: (root: LayoutNode) => void
  setFocusedGroup: (groupId: string) => void
  /** Insert newGroupId next to targetGroupId in the given direction, keeping layout flat */
  insertPanel: (targetGroupId: string, position: DropPosition, newGroupId: string) => void
  /** Insert a panel at the very edge of the root layout */
  insertAtEdge: (position: 'east' | 'west', newGroupId: string) => void
  removeGroup: (groupId: string) => void
  /** Update the sizes array for the container that holds groupId */
  setSizes: (groupId: string, sizes: number[]) => void
  getAllGroupIds: () => string[]

  // Legacy compat – used by project-io save/restore
  splitGroup: (groupId: string, direction: 'horizontal' | 'vertical', newGroupId: string) => void
  setRatio: (groupId: string, ratio: number) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectGroupIds(node: LayoutNode): string[] {
  if (node.type === 'leaf') return [node.groupId]
  return node.children.flatMap(c => collectGroupIds(c.node))
}

/** Find the index of a child that contains a given groupId (direct leaf or nested). */
function findChildIndex(children: LayoutChild[], groupId: string): number {
  return children.findIndex(c => collectGroupIds(c.node).includes(groupId))
}

/** Simplify containers: unwrap single-child containers, collapse nested same-direction. */
function simplify(node: LayoutNode): LayoutNode {
  if (node.type === 'leaf') return node

  // Recursively simplify children first
  let children = node.children.map(c => ({ ...c, node: simplify(c.node) }))

  // Flatten nested same-direction containers
  // e.g. row([row([A, B]), C]) -> row([A, B, C])
  const flattened: LayoutChild[] = []
  for (const child of children) {
    if (child.node.type === node.type) {
      // Same direction – flatten: distribute parent size proportionally
      const nested = child.node as Extract<LayoutNode, { type: 'row' | 'column' }>
      const totalNestedSize = nested.children.reduce((s, c) => s + c.size, 0)
      for (const nc of nested.children) {
        flattened.push({
          node: nc.node,
          size: (nc.size / totalNestedSize) * child.size,
        })
      }
    } else {
      flattened.push(child)
    }
  }
  children = flattened

  // Single child – unwrap
  if (children.length === 1) return children[0].node
  if (children.length === 0) return { type: 'leaf', groupId: '' } // shouldn't happen

  return { ...node, children }
}

/**
 * Insert a new leaf next to a target group.
 *
 * If the target's parent container direction matches, we insert into the flat
 * list. Otherwise we wrap the target in a new container.
 */
function insertNext(
  node: LayoutNode,
  targetGroupId: string,
  newGroupId: string,
  containerType: 'row' | 'column',
  before: boolean, // true = insert before target, false = insert after
): LayoutNode {
  const newLeaf: LayoutChild = { node: { type: 'leaf', groupId: newGroupId }, size: 1 }

  if (node.type === 'leaf') {
    if (node.groupId === targetGroupId) {
      // Wrap in a new container
      const existing: LayoutChild = { node, size: 1 }
      return {
        type: containerType,
        children: before ? [newLeaf, existing] : [existing, newLeaf],
      }
    }
    return node
  }

  // Container node (row or column)
  if (node.type === containerType) {
    // Same direction – check if target is a direct child
    const idx = node.children.findIndex(c =>
      c.node.type === 'leaf' && c.node.groupId === targetGroupId
    )
    if (idx !== -1) {
      // Insert into the flat list
      const newChildren = [...node.children]
      const insertIdx = before ? idx : idx + 1
      newChildren.splice(insertIdx, 0, newLeaf)
      return { ...node, children: newChildren }
    }

    // Also check if target is nested inside a child of same direction
    const nestedIdx = findChildIndex(node.children, targetGroupId)
    if (nestedIdx !== -1) {
      const child = node.children[nestedIdx]
      const updatedChild = insertNext(child.node, targetGroupId, newGroupId, containerType, before)
      const newChildren = [...node.children]
      newChildren[nestedIdx] = { ...child, node: updatedChild }
      return simplify({ ...node, children: newChildren })
    }

    return node
  }

  // Different direction container – recurse into children
  const idx = findChildIndex(node.children, targetGroupId)
  if (idx === -1) return node

  const child = node.children[idx]
  const updatedChild = insertNext(child.node, targetGroupId, newGroupId, containerType, before)
  const newChildren = [...node.children]
  newChildren[idx] = { ...child, node: updatedChild }
  return simplify({ ...node, children: newChildren })
}

/**
 * Remove a group from the tree and simplify.
 */
function removeFromTree(node: LayoutNode, targetGroupId: string): LayoutNode | null {
  if (node.type === 'leaf') {
    return node.groupId === targetGroupId ? null : node
  }

  const newChildren = node.children
    .map(c => {
      const result = removeFromTree(c.node, targetGroupId)
      if (!result) return null
      return { ...c, node: result }
    })
    .filter((c): c is LayoutChild => c !== null)

  if (newChildren.length === 0) return null
  if (newChildren.length === 1) return newChildren[0].node

  return simplify({ ...node, children: newChildren })
}

/**
 * Update sizes for the container that directly holds groupId as a child.
 */
function updateSizes(node: LayoutNode, targetGroupId: string, sizes: number[]): LayoutNode {
  if (node.type === 'leaf') return node

  // Check if this container directly holds the target
  const hasTarget = node.children.some(c =>
    c.node.type === 'leaf' && c.node.groupId === targetGroupId
  )
  if (hasTarget && sizes.length === node.children.length) {
    return {
      ...node,
      children: node.children.map((c, i) => ({ ...c, size: sizes[i] })),
    }
  }

  // Recurse
  return {
    ...node,
    children: node.children.map(c => ({ ...c, node: updateSizes(c.node, targetGroupId, sizes) })),
  }
}

// ---------------------------------------------------------------------------
// Legacy binary-tree compat (for project-io save/restore)
// ---------------------------------------------------------------------------

/** Convert old binary-tree format to new N-ary format on load. */
export function migrateLayout(node: any): LayoutNode {
  if (!node) return { type: 'leaf', groupId: '' }
  if (node.type === 'leaf') return node as LayoutNode
  if (node.type === 'row' || node.type === 'column') {
    // Already new format
    return {
      ...node,
      children: node.children.map((c: any) => ({
        ...c,
        node: migrateLayout(c.node),
      })),
    } as LayoutNode
  }
  // Old binary split format
  if (node.type === 'split') {
    const containerType = node.direction === 'horizontal' ? 'row' : 'column'
    const first = migrateLayout(node.first)
    const second = migrateLayout(node.second)
    const ratio = node.ratio ?? 0.5
    return simplify({
      type: containerType,
      children: [
        { node: first, size: ratio },
        { node: second, size: 1 - ratio },
      ],
    })
  }
  return node as LayoutNode
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useLayoutStore = create<LayoutState>((set, get) => ({
  root: null,
  focusedGroupId: null,

  setRoot: (root) => {
    // Auto-migrate old binary tree format
    const migrated = root ? migrateLayout(root) : null
    set({ root: migrated })
  },

  setFocusedGroup: (groupId) => set({ focusedGroupId: groupId }),

  insertPanel: (targetGroupId, position, newGroupId) => {
    set(state => {
      if (!state.root) return state
      const containerType: 'row' | 'column' =
        position === 'east' || position === 'west' ? 'row' : 'column'
      const before = position === 'west' || position === 'north'
      const newRoot = insertNext(state.root, targetGroupId, newGroupId, containerType, before)
      return { root: simplify(newRoot) }
    })
  },

  insertAtEdge: (position, newGroupId) => {
    set(state => {
      if (!state.root) return state
      const newLeaf: LayoutChild = { node: { type: 'leaf', groupId: newGroupId }, size: 1 }
      const existingChild: LayoutChild = {
        node: state.root,
        size: state.root.type === 'row'
          ? state.root.children.reduce((s, c) => s + c.size, 0)
          : 1,
      }

      if (state.root.type === 'row') {
        // Already a row – just prepend/append
        const newChildren = position === 'west'
          ? [newLeaf, ...state.root.children]
          : [...state.root.children, newLeaf]
        return { root: { type: 'row' as const, children: newChildren } }
      }

      // Wrap in a new row
      const children = position === 'west'
        ? [newLeaf, existingChild]
        : [existingChild, newLeaf]
      return { root: { type: 'row' as const, children } }
    })
  },

  removeGroup: (groupId) => {
    set(state => {
      if (!state.root) return state
      const newRoot = removeFromTree(state.root, groupId)
      return { root: newRoot ? simplify(newRoot) : null }
    })
  },

  setSizes: (groupId, sizes) => {
    set(state => {
      if (!state.root) return state
      return { root: updateSizes(state.root, groupId, sizes) }
    })
  },

  getAllGroupIds: () => {
    const { root } = get()
    if (!root) return []
    return collectGroupIds(root)
  },

  // Legacy compat
  splitGroup: (groupId, direction, newGroupId) => {
    const position: DropPosition = direction === 'horizontal' ? 'east' : 'south'
    get().insertPanel(groupId, position, newGroupId)
  },

  setRatio: (groupId, ratio) => {
    // Convert binary ratio to sizes for the container holding groupId
    get().setSizes(groupId, [ratio, 1 - ratio])
  },
}))

export { nanoid }
