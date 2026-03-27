import { create } from 'zustand'
import { nanoid } from '../lib/nanoid'

export type TabType = string

export interface Tab {
  id: string
  type: TabType
  title: string
  filePath?: string
  url?: string
  isDirty?: boolean
  isThinking?: boolean
  thinkingTime?: string
  content?: string
  initialCommand?: string
  autoPilot?: boolean
}

export interface TabGroup {
  id: string
  tabs: Tab[]
  activeTabId: string | null
  /** The git worktree path this group is associated with */
  worktree?: string
}

interface TabsState {
  groups: Record<string, TabGroup>
  createGroup: () => string
  removeGroup: (groupId: string) => void
  addTab: (groupId: string, tab: Omit<Tab, 'id'> & { id?: string }) => string
  removeTab: (groupId: string, tabId: string) => void
  setActiveTab: (groupId: string, tabId: string) => void
  moveTab: (fromGroupId: string, tabId: string, toGroupId: string, atIndex?: number) => void
  reorderTab: (groupId: string, fromIndex: number, toIndex: number) => void
  updateTab: (groupId: string, tabId: string, updates: Partial<Tab>) => void
  setGroupWorktree: (groupId: string, worktree: string | undefined) => void
  getGroup: (groupId: string) => TabGroup | undefined
}

export const useTabsStore = create<TabsState>((set, get) => ({
  groups: {},

  createGroup: () => {
    const id = nanoid()
    set(state => ({
      groups: {
        ...state.groups,
        [id]: { id, tabs: [], activeTabId: null }
      }
    }))
    return id
  },

  removeGroup: (groupId) => {
    set(state => {
      const newGroups = { ...state.groups }
      delete newGroups[groupId]
      return { groups: newGroups }
    })
  },

  addTab: (groupId, tabData) => {
    const id = tabData.id || nanoid()
    // If a specific ID was requested and already exists, just focus it
    if (tabData.id) {
      const group = get().groups[groupId]
      if (group?.tabs.find(t => t.id === tabData.id)) {
        set(state => ({
          groups: { ...state.groups, [groupId]: { ...state.groups[groupId], activeTabId: tabData.id! } }
        }))
        return tabData.id
      }
    }
    const { id: _id, ...rest } = tabData as Tab
    const tab: Tab = { id, ...rest }
    set(state => {
      const group = state.groups[groupId]
      if (!group) return state
      return {
        groups: {
          ...state.groups,
          [groupId]: {
            ...group,
            tabs: [...group.tabs, tab],
            activeTabId: id
          }
        }
      }
    })
    return id
  },

  removeTab: (groupId, tabId) => {
    set(state => {
      const group = state.groups[groupId]
      if (!group) return state
      const newTabs = group.tabs.filter(t => t.id !== tabId)
      let newActiveId = group.activeTabId
      if (newActiveId === tabId) {
        const idx = group.tabs.findIndex(t => t.id === tabId)
        if (newTabs.length > 0) {
          newActiveId = newTabs[Math.max(0, idx - 1)].id
        } else {
          newActiveId = null
        }
      }
      return {
        groups: {
          ...state.groups,
          [groupId]: {
            ...group,
            tabs: newTabs,
            activeTabId: newActiveId
          }
        }
      }
    })
  },

  setActiveTab: (groupId, tabId) => {
    set(state => {
      const group = state.groups[groupId]
      if (!group) return state
      return {
        groups: {
          ...state.groups,
          [groupId]: { ...group, activeTabId: tabId }
        }
      }
    })
  },

  moveTab: (fromGroupId, tabId, toGroupId, atIndex) => {
    set(state => {
      const fromGroup = state.groups[fromGroupId]
      const toGroup = state.groups[toGroupId]
      if (!fromGroup || !toGroup) return state

      const tab = fromGroup.tabs.find(t => t.id === tabId)
      if (!tab) return state

      const newFromTabs = fromGroup.tabs.filter(t => t.id !== tabId)
      let newFromActiveId = fromGroup.activeTabId
      if (newFromActiveId === tabId) {
        const idx = fromGroup.tabs.findIndex(t => t.id === tabId)
        newFromActiveId = newFromTabs.length > 0
          ? newFromTabs[Math.max(0, idx - 1)].id
          : null
      }

      const newToTabs = [...toGroup.tabs]
      if (atIndex !== undefined) {
        newToTabs.splice(atIndex, 0, tab)
      } else {
        newToTabs.push(tab)
      }

      return {
        groups: {
          ...state.groups,
          [fromGroupId]: {
            ...fromGroup,
            tabs: newFromTabs,
            activeTabId: newFromActiveId
          },
          [toGroupId]: {
            ...toGroup,
            tabs: newToTabs,
            activeTabId: tabId
          }
        }
      }
    })
  },

  reorderTab: (groupId, fromIndex, toIndex) => {
    set(state => {
      const group = state.groups[groupId]
      if (!group) return state
      const newTabs = [...group.tabs]
      const [moved] = newTabs.splice(fromIndex, 1)
      newTabs.splice(toIndex, 0, moved)
      return {
        groups: {
          ...state.groups,
          [groupId]: { ...group, tabs: newTabs }
        }
      }
    })
  },

  updateTab: (groupId, tabId, updates) => {
    set(state => {
      const group = state.groups[groupId]
      if (!group) return state
      return {
        groups: {
          ...state.groups,
          [groupId]: {
            ...group,
            tabs: group.tabs.map(t => t.id === tabId ? { ...t, ...updates } : t)
          }
        }
      }
    })
  },

  setGroupWorktree: (groupId, worktree) => {
    set(state => {
      const group = state.groups[groupId]
      if (!group) return state
      return {
        groups: {
          ...state.groups,
          [groupId]: { ...group, worktree }
        }
      }
    })
  },

  getGroup: (groupId) => {
    return get().groups[groupId]
  }
}))
