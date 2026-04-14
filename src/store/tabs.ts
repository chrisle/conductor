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
  apiKey?: string
  autoPilot?: boolean
  hasSession?: boolean
  refreshKey?: number
  /** Free-form note shown on hover; edited via right-click → Edit Tab Note */
  note?: string
  /** Git ref for virtual file browsing (read-only) */
  gitRef?: string
  /** Git repo root path, used with gitRef to resolve virtual file content */
  gitRepoRoot?: string
}

export interface TabGroup {
  id: string
  tabs: Tab[]
  activeTabId: string | null
  /** Tracks tab activation order for MRU (most-recently-used) tab switching.
   *  Most recent tab ID is at the end of the array. When a tab is closed,
   *  the previously active tab (second-to-last) becomes active. */
  tabHistory: string[]
  /** The git worktree path this group is associated with */
  worktree?: string
  /** When true, the pane is locked — tabs cannot be closed, moved, or reordered */
  locked?: boolean
}

export interface TabsState {
  groups: Record<string, TabGroup>
  /** Per-group set of selected tab IDs for multi-select (shift/cmd-click) */
  selectedTabIds: Record<string, Set<string>>
  /** Per-group anchor tab ID for shift-click range selection */
  selectionAnchor: Record<string, string | null>
  createGroup: () => string
  removeGroup: (groupId: string) => void
  addTab: (groupId: string, tab: Omit<Tab, 'id'> & { id?: string }, options?: { afterActiveTab?: boolean }) => string
  removeTab: (groupId: string, tabId: string) => void
  setActiveTab: (groupId: string, tabId: string) => void
  moveTab: (fromGroupId: string, tabId: string, toGroupId: string, atIndex?: number) => void
  reorderTab: (groupId: string, fromIndex: number, toIndex: number) => void
  updateTab: (groupId: string, tabId: string, updates: Partial<Tab>) => void
  setGroupWorktree: (groupId: string, worktree: string | undefined) => void
  setGroupLocked: (groupId: string, locked: boolean) => void
  getGroup: (groupId: string) => TabGroup | undefined
  /** Toggle a single tab in the selection (cmd/ctrl-click) */
  toggleSelectTab: (groupId: string, tabId: string) => void
  /** Select a range of tabs from anchor to target (shift-click) */
  selectTabRange: (groupId: string, tabId: string) => void
  /** Clear all selected tabs for a group */
  clearSelection: (groupId: string) => void
  /** Get the selected tab IDs for a group as an array */
  getSelectedTabIds: (groupId: string) => string[]
}

export const useTabsStore = create<TabsState>((set, get) => ({
  groups: {},
  selectedTabIds: {},
  selectionAnchor: {},

  createGroup: () => {
    const id = nanoid()
    set(state => ({
      groups: {
        ...state.groups,
        [id]: { id, tabs: [], activeTabId: null, tabHistory: [] }
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

  addTab: (groupId, tabData, options) => {
    const id = tabData.id || nanoid()
    // If a specific ID was requested and already exists, just focus it
    if (tabData.id) {
      const group = get().groups[groupId]
      if (group?.tabs.find(t => t.id === tabData.id)) {
        set(state => {
          const g = state.groups[groupId]
          return {
            groups: {
              ...state.groups,
              [groupId]: {
                ...g,
                activeTabId: tabData.id!,
                tabHistory: [...g.tabHistory.filter(id => id !== tabData.id!), tabData.id!]
              }
            }
          }
        })
        return tabData.id
      }
    }
    const { id: _id, ...rest } = tabData as Tab
    const tab: Tab = { id, ...rest }
    set(state => {
      const group = state.groups[groupId]
      if (!group) return state
      // Insert after the currently active tab when requested
      let newTabs: Tab[]
      if (options?.afterActiveTab && group.activeTabId) {
        const activeIndex = group.tabs.findIndex(t => t.id === group.activeTabId)
        newTabs = [...group.tabs]
        newTabs.splice(activeIndex + 1, 0, tab)
      } else {
        newTabs = [...group.tabs, tab]
      }
      return {
        groups: {
          ...state.groups,
          [groupId]: {
            ...group,
            tabs: newTabs,
            activeTabId: id,
            tabHistory: [...group.tabHistory, id]
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
      const newHistory = group.tabHistory.filter(id => id !== tabId)
      let newActiveId = group.activeTabId
      if (newActiveId === tabId) {
        if (newHistory.length > 0) {
          // Activate the most recently used tab (last in history)
          newActiveId = newHistory[newHistory.length - 1]
        } else if (newTabs.length > 0) {
          // Fallback: no history, pick adjacent tab
          const idx = group.tabs.findIndex(t => t.id === tabId)
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
            activeTabId: newActiveId,
            tabHistory: newHistory
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
          [groupId]: {
            ...group,
            activeTabId: tabId,
            tabHistory: [...group.tabHistory.filter(id => id !== tabId), tabId]
          }
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
      const newFromHistory = fromGroup.tabHistory.filter(id => id !== tabId)
      let newFromActiveId = fromGroup.activeTabId
      if (newFromActiveId === tabId) {
        if (newFromHistory.length > 0) {
          newFromActiveId = newFromHistory[newFromHistory.length - 1]
        } else if (newFromTabs.length > 0) {
          const idx = fromGroup.tabs.findIndex(t => t.id === tabId)
          newFromActiveId = newFromTabs[Math.max(0, idx - 1)].id
        } else {
          newFromActiveId = null
        }
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
            activeTabId: newFromActiveId,
            tabHistory: newFromHistory
          },
          [toGroupId]: {
            ...toGroup,
            tabs: newToTabs,
            activeTabId: tabId,
            tabHistory: [...toGroup.tabHistory.filter(id => id !== tabId), tabId]
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

  setGroupLocked: (groupId, locked) => {
    set(state => {
      const group = state.groups[groupId]
      if (!group) return state
      return {
        groups: {
          ...state.groups,
          [groupId]: { ...group, locked }
        }
      }
    })
  },

  getGroup: (groupId) => {
    return get().groups[groupId]
  },

  toggleSelectTab: (groupId, tabId) => {
    set(state => {
      const current = new Set(state.selectedTabIds[groupId] || [])
      if (current.has(tabId)) {
        current.delete(tabId)
      } else {
        current.add(tabId)
      }
      return {
        selectedTabIds: { ...state.selectedTabIds, [groupId]: current },
        selectionAnchor: { ...state.selectionAnchor, [groupId]: tabId },
      }
    })
  },

  selectTabRange: (groupId, tabId) => {
    const group = get().groups[groupId]
    if (!group) return
    const anchor = get().selectionAnchor[groupId]
    if (!anchor) {
      // No anchor yet — just select this one tab and set it as anchor
      set(state => ({
        selectedTabIds: { ...state.selectedTabIds, [groupId]: new Set([tabId]) },
        selectionAnchor: { ...state.selectionAnchor, [groupId]: tabId },
      }))
      return
    }
    const tabIds = group.tabs.map(t => t.id)
    const anchorIdx = tabIds.indexOf(anchor)
    const targetIdx = tabIds.indexOf(tabId)
    if (anchorIdx === -1 || targetIdx === -1) return
    const start = Math.min(anchorIdx, targetIdx)
    const end = Math.max(anchorIdx, targetIdx)
    const rangeIds = tabIds.slice(start, end + 1)
    set(state => ({
      selectedTabIds: { ...state.selectedTabIds, [groupId]: new Set(rangeIds) },
      // Keep existing anchor for subsequent shift-clicks
    }))
  },

  clearSelection: (groupId) => {
    set(state => ({
      selectedTabIds: { ...state.selectedTabIds, [groupId]: new Set<string>() },
      selectionAnchor: { ...state.selectionAnchor, [groupId]: null },
    }))
  },

  getSelectedTabIds: (groupId) => {
    const group = get().groups[groupId]
    const selected = get().selectedTabIds[groupId]
    if (!group || !selected || selected.size === 0) return []
    // Return in tab order
    return group.tabs.filter(t => selected.has(t.id)).map(t => t.id)
  },
}))
