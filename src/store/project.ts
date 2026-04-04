import { create } from 'zustand'
import { nanoid } from '@/lib/nanoid'
import type { LayoutNode } from './layout'
import type { ProjectSettings } from '@/types/project-settings'

export interface SessionGroup {
  id: string
  name: string
  sessionIds: string[]
}

export type SessionSortOrder = 'none' | 'created' | 'alpha' | 'activity' | 'attached'

export interface SerializedTab {
  id: string
  type: string
  title: string
  filePath?: string
  url?: string
  content?: string
  initialCommand?: string
  terminalHistory?: string
}

export interface SerializedTabGroup {
  id: string
  tabs: SerializedTab[]
  activeTabId: string | null
  worktree?: string
}

/** A single workspace: a saved arrangement of tabs */
export interface Workspace {
  layout: LayoutNode
  groups: Record<string, SerializedTabGroup>
  focusedGroupId: string | null
  settings?: ProjectSettings
}

/** The serialized format written to .conductor files */
export interface ConductorProject {
  version: 2 | 3
  name: string
  activeWorkspace: string
  workspaces: Record<string, Workspace>
  workspaceOrder?: string[]
  sidebar: {
    rootPath: string | null
    expandedPaths: string[]
  }
  activeExtensionId: string | null
  jira?: {
    spaceKeys: string[]
    connectionId?: string
  }
  settings?: ProjectSettings
  /** Custom titles for sessions, keyed by session name (tab ID) */
  sessionTitles?: Record<string, string>
  /** User-defined session groups */
  sessionGroups?: SessionGroup[]
  sessionSort?: SessionSortOrder
}

export interface ProjectState {
  filePath: string | null
  name: string | null
  activeWorkspace: string | null
  workspaceNames: string[]
  dirtyWorkspaces: Set<string>
  recentProjects: Array<{ name: string; path: string }>
  jiraSpaceKeys: string[]
  jiraConnectionId: string | null
  projectSettings: ProjectSettings | undefined
  workspaceSettings: ProjectSettings | undefined
  sessionTitles: Record<string, string>
  sessionGroups: SessionGroup[]
  sessionSort: SessionSortOrder
  ungroupedSessionOrder: string[]

  setProject: (filePath: string, name: string) => void
  setJiraConfig: (spaceKeys: string[], connectionId?: string) => void
  setProjectSettings: (settings: ProjectSettings | undefined) => void
  setWorkspaceSettings: (settings: ProjectSettings | undefined) => void
  setName: (name: string) => void
  clearProject: () => void
  setActiveWorkspace: (name: string) => void
  setWorkspaceNames: (names: string[]) => void
  markWorkspaceDirty: (name?: string) => void
  clearWorkspaceDirty: (name?: string) => void
  isWorkspaceDirty: (name?: string) => boolean
  isAnyDirty: () => boolean
  reorderWorkspace: (fromIndex: number, toIndex: number) => void
  renameWorkspaceInStore: (oldName: string, newName: string) => void
  setSessionTitle: (sessionId: string, title: string) => void
  clearSessionTitle: (sessionId: string) => void
  setSessionTitles: (titles: Record<string, string>) => void
  setSessionGroups: (groups: SessionGroup[]) => void
  addSessionGroup: (name: string, sessionIds: string[]) => string
  removeSessionGroup: (groupId: string) => void
  renameSessionGroup: (groupId: string, name: string) => void
  addSessionsToGroup: (groupId: string, sessionIds: string[]) => void
  removeSessionFromGroup: (groupId: string, sessionId: string) => void
  reorderSessionInGroup: (groupId: string, sessionId: string, beforeSessionId: string | null) => void
  setUngroupedSessionOrder: (order: string[]) => void
  reorderUngroupedSession: (sessionId: string, beforeSessionId: string | null) => void
  setSessionSort: (sort: SessionSortOrder) => void
  addRecentProject: (name: string, path: string) => void
  loadRecentProjects: () => Promise<void>
  saveRecentProjects: () => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  filePath: null,
  name: null,
  activeWorkspace: null,
  workspaceNames: [],
  dirtyWorkspaces: new Set<string>(),
  recentProjects: [],
  jiraSpaceKeys: [],
  jiraConnectionId: null,
  projectSettings: undefined,
  workspaceSettings: undefined,
  sessionTitles: {},
  sessionGroups: [],
  sessionSort: 'created' as SessionSortOrder,
  ungroupedSessionOrder: [] as string[],

  setProjectSettings: (settings) => set({ projectSettings: settings }),
  setWorkspaceSettings: (settings) => set({ workspaceSettings: settings }),

  setProject: (filePath, name) => {
    set({ filePath, name, dirtyWorkspaces: new Set() })
    get().addRecentProject(name, filePath)
  },

  setJiraConfig: (spaceKeys, connectionId) => {
    set({ jiraSpaceKeys: spaceKeys, jiraConnectionId: connectionId ?? null })
  },

  setName: (name) => {
    set({ name })
    const { filePath } = get()
    if (filePath) get().addRecentProject(name, filePath)
  },

  clearProject: () => set({
    filePath: null, name: null, activeWorkspace: null,
    workspaceNames: [], dirtyWorkspaces: new Set(),
    jiraSpaceKeys: [], jiraConnectionId: null,
    projectSettings: undefined, workspaceSettings: undefined,
    sessionTitles: {}, sessionGroups: [], sessionSort: 'created' as SessionSortOrder, ungroupedSessionOrder: [],
  }),

  setActiveWorkspace: (name) => set({ activeWorkspace: name }),

  setWorkspaceNames: (names) => set({ workspaceNames: names }),

  markWorkspaceDirty: (name?) => {
    const ws = name || get().activeWorkspace
    if (!ws) return
    set(state => {
      const next = new Set(state.dirtyWorkspaces)
      next.add(ws)
      return { dirtyWorkspaces: next }
    })
  },

  clearWorkspaceDirty: (name?) => {
    const ws = name || get().activeWorkspace
    if (!ws) return
    set(state => {
      const next = new Set(state.dirtyWorkspaces)
      next.delete(ws)
      return { dirtyWorkspaces: next }
    })
  },

  isWorkspaceDirty: (name?) => {
    const ws = name || get().activeWorkspace
    if (!ws) return false
    return get().dirtyWorkspaces.has(ws)
  },

  isAnyDirty: () => {
    return get().dirtyWorkspaces.size > 0
  },

  reorderWorkspace: (fromIndex, toIndex) => {
    set(state => {
      const names = [...state.workspaceNames]
      const [moved] = names.splice(fromIndex, 1)
      names.splice(toIndex, 0, moved)
      return { workspaceNames: names }
    })
  },

  renameWorkspaceInStore: (oldName, newName) => {
    set(state => {
      const names = state.workspaceNames.map(n => n === oldName ? newName : n)
      const activeWorkspace = state.activeWorkspace === oldName ? newName : state.activeWorkspace
      const dirtyWorkspaces = new Set(state.dirtyWorkspaces)
      if (dirtyWorkspaces.has(oldName)) {
        dirtyWorkspaces.delete(oldName)
        dirtyWorkspaces.add(newName)
      }
      return { workspaceNames: names, activeWorkspace, dirtyWorkspaces }
    })
  },

  setSessionTitle: (sessionId, title) => {
    set(state => ({
      sessionTitles: { ...state.sessionTitles, [sessionId]: title }
    }))
    get().markWorkspaceDirty()
  },

  clearSessionTitle: (sessionId) => {
    set(state => {
      const next = { ...state.sessionTitles }
      delete next[sessionId]
      return { sessionTitles: next }
    })
    get().markWorkspaceDirty()
  },

  setSessionTitles: (titles) => set({ sessionTitles: titles }),

  setSessionGroups: (groups) => set({ sessionGroups: groups }),

  addSessionGroup: (name, sessionIds) => {
    const id = nanoid()
    set(state => {
      // Remove sessionIds from any existing groups first
      const idSet = new Set(sessionIds)
      const cleaned = state.sessionGroups.map(g => ({
        ...g,
        sessionIds: g.sessionIds.filter(sid => !idSet.has(sid)),
      }))
      return { sessionGroups: [...cleaned, { id, name, sessionIds }] }
    })
    get().markWorkspaceDirty()
    return id
  },

  removeSessionGroup: (groupId) => {
    set(state => ({
      sessionGroups: state.sessionGroups.filter(g => g.id !== groupId),
    }))
    get().markWorkspaceDirty()
  },

  renameSessionGroup: (groupId, name) => {
    set(state => ({
      sessionGroups: state.sessionGroups.map(g =>
        g.id === groupId ? { ...g, name } : g
      ),
    }))
    get().markWorkspaceDirty()
  },

  addSessionsToGroup: (groupId, sessionIds) => {
    set(state => {
      const idSet = new Set(sessionIds)
      // Remove from other groups first
      const updated = state.sessionGroups.map(g => {
        if (g.id === groupId) {
          const merged = new Set([...g.sessionIds, ...sessionIds])
          return { ...g, sessionIds: [...merged] }
        }
        return { ...g, sessionIds: g.sessionIds.filter(sid => !idSet.has(sid)) }
      })
      return { sessionGroups: updated }
    })
    get().markWorkspaceDirty()
  },

  removeSessionFromGroup: (groupId, sessionId) => {
    set(state => ({
      sessionGroups: state.sessionGroups.map(g =>
        g.id === groupId
          ? { ...g, sessionIds: g.sessionIds.filter(sid => sid !== sessionId) }
          : g
      ),
    }))
    get().markWorkspaceDirty()
  },

  reorderSessionInGroup: (groupId, sessionId, beforeSessionId) => {
    set(state => ({
      sessionGroups: state.sessionGroups.map(g => {
        if (g.id !== groupId) return g
        const ids = g.sessionIds.filter(sid => sid !== sessionId)
        if (beforeSessionId === null) {
          ids.push(sessionId)
        } else {
          const idx = ids.indexOf(beforeSessionId)
          if (idx !== -1) ids.splice(idx, 0, sessionId)
          else ids.push(sessionId)
        }
        return { ...g, sessionIds: ids }
      }),
    }))
    get().markWorkspaceDirty()
  },

  setUngroupedSessionOrder: (order) => {
    set({ ungroupedSessionOrder: order })
    get().markWorkspaceDirty()
  },

  reorderUngroupedSession: (sessionId, beforeSessionId) => {
    set(state => {
      const ids = state.ungroupedSessionOrder.filter(sid => sid !== sessionId)
      if (beforeSessionId === null) {
        ids.push(sessionId)
      } else {
        const idx = ids.indexOf(beforeSessionId)
        if (idx !== -1) ids.splice(idx, 0, sessionId)
        else ids.push(sessionId)
      }
      return { ungroupedSessionOrder: ids }
    })
    get().markWorkspaceDirty()
  },

  setSessionSort: (sort) => {
    set({ sessionSort: sort })
    get().markWorkspaceDirty()
  },

  addRecentProject: (name, path) => {
    set(state => {
      const filtered = state.recentProjects.filter(p => p.path !== path)
      const updated = [{ name, path }, ...filtered].slice(0, 10)
      return { recentProjects: updated }
    })
    get().saveRecentProjects()
  },

  loadRecentProjects: async () => {
    try {
      const list = await window.electronAPI.loadRecentProjects()
      if (list && list.length > 0) {
        set({ recentProjects: list })
      }
    } catch {}
  },

  saveRecentProjects: async () => {
    try {
      await window.electronAPI.saveRecentProjects(get().recentProjects)
    } catch {}
  }
}))
