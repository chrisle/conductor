import { create } from 'zustand'
import { nanoid } from '../lib/nanoid'

export type LayoutNode =
  | { type: 'leaf'; groupId: string }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      ratio: number
      first: LayoutNode
      second: LayoutNode
    }

export interface LayoutState {
  root: LayoutNode | null
  focusedGroupId: string | null
  setRoot: (root: LayoutNode) => void
  setFocusedGroup: (groupId: string) => void
  splitGroup: (groupId: string, direction: 'horizontal' | 'vertical', newGroupId: string) => void
  removeGroup: (groupId: string) => void
  setRatio: (groupId: string, ratio: number) => void
  getAllGroupIds: () => string[]
}

function findAndSplit(
  node: LayoutNode,
  targetGroupId: string,
  direction: 'horizontal' | 'vertical',
  newGroupId: string
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.groupId === targetGroupId) {
      return {
        type: 'split',
        direction,
        ratio: 0.5,
        first: node,
        second: { type: 'leaf', groupId: newGroupId }
      }
    }
    return node
  }
  return {
    ...node,
    first: findAndSplit(node.first, targetGroupId, direction, newGroupId),
    second: findAndSplit(node.second, targetGroupId, direction, newGroupId)
  }
}

function findAndRemove(node: LayoutNode, targetGroupId: string): LayoutNode | null {
  if (node.type === 'leaf') {
    return node.groupId === targetGroupId ? null : node
  }
  const newFirst = findAndRemove(node.first, targetGroupId)
  const newSecond = findAndRemove(node.second, targetGroupId)
  if (!newFirst) return newSecond
  if (!newSecond) return newFirst
  return { ...node, first: newFirst, second: newSecond }
}

function updateRatio(node: LayoutNode, targetGroupId: string, ratio: number): LayoutNode {
  if (node.type === 'leaf') return node
  if (
    (node.first.type === 'leaf' && node.first.groupId === targetGroupId) ||
    (node.second.type === 'leaf' && node.second.groupId === targetGroupId)
  ) {
    return { ...node, ratio }
  }
  return {
    ...node,
    first: updateRatio(node.first, targetGroupId, ratio),
    second: updateRatio(node.second, targetGroupId, ratio)
  }
}

function collectGroupIds(node: LayoutNode): string[] {
  if (node.type === 'leaf') return [node.groupId]
  return [...collectGroupIds(node.first), ...collectGroupIds(node.second)]
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  root: null,
  focusedGroupId: null,

  setRoot: (root) => set({ root }),

  setFocusedGroup: (groupId) => set({ focusedGroupId: groupId }),

  splitGroup: (groupId, direction, newGroupId) => {
    set(state => {
      if (!state.root) return state
      return { root: findAndSplit(state.root, groupId, direction, newGroupId) }
    })
  },

  removeGroup: (groupId) => {
    set(state => {
      if (!state.root) return state
      const newRoot = findAndRemove(state.root, groupId)
      return { root: newRoot }
    })
  },

  setRatio: (groupId, ratio) => {
    set(state => {
      if (!state.root) return state
      return { root: updateRatio(state.root, groupId, ratio) }
    })
  },

  getAllGroupIds: () => {
    const { root } = get()
    if (!root) return []
    return collectGroupIds(root)
  }
}))

export { nanoid }
