import { create } from 'zustand'
import { nanoid } from '@/lib/nanoid'
import type { LayoutNode } from './layout'
import type { ProjectSettings } from '@/types/project-settings'

/** @deprecated Use SessionFolder instead — kept for migration */
export interface SessionGroup {
  id: string
  name: string
  sessionIds: string[]
}

export interface SessionFolder {
  id: string
  name: string
  parentId: string | null  // null = root level
  sessionIds: string[]     // sessions directly in this folder
  collapsed: boolean
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
  apiKey?: string
  terminalHistory?: string
  autoPilot?: boolean
  note?: string
}

export interface SerializedTabGroup {
  id: string
  tabs: SerializedTab[]
  activeTabId: string | null
  tabHistory?: string[]
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
  /** @deprecated Use sessionFolders instead */
  sessionGroups?: SessionGroup[]
  sessionSort?: SessionSortOrder
  /** Nested folder tree for sessions */
  sessionFolders?: SessionFolder[]
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
  sessionFolders: SessionFolder[]

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

  // Folder operations
  setSessionFolders: (folders: SessionFolder[]) => void
  addSessionFolder: (name: string, parentId: string | null) => string
  removeSessionFolder: (folderId: string) => void
  renameSessionFolder: (folderId: string, name: string) => void
  toggleFolderCollapsed: (folderId: string) => void
  moveSessionToFolder: (sessionId: string, folderId: string | null) => void
  moveSessionsToFolder: (sessionIds: string[], folderId: string | null) => void
  moveFolderToFolder: (folderId: string, targetParentId: string | null) => void
  removeSessionFromAllFolders: (sessionId: string) => void

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
  sessionFolders: [],

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
    sessionTitles: {}, sessionFolders: [],
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

  // ── Folder operations ──────────────────────────────────

  setSessionFolders: (folders) => set({ sessionFolders: folders }),

  addSessionFolder: (name, parentId) => {
    const id = nanoid()
    set(state => ({
      sessionFolders: [...state.sessionFolders, { id, name, parentId, sessionIds: [], collapsed: false }]
    }))
    get().markWorkspaceDirty()
    return id
  },

  removeSessionFolder: (folderId) => {
    set(state => {
      // Collect all descendant folder IDs recursively
      const toRemove = new Set<string>()
      function collectDescendants(id: string) {
        toRemove.add(id)
        for (const f of state.sessionFolders) {
          if (f.parentId === id) collectDescendants(f.id)
        }
      }
      collectDescendants(folderId)

      // Keep folders not being removed; reparent children of removed folders' direct children go to root
      return {
        sessionFolders: state.sessionFolders.filter(f => !toRemove.has(f.id)),
      }
    })
    get().markWorkspaceDirty()
  },

  renameSessionFolder: (folderId, name) => {
    set(state => ({
      sessionFolders: state.sessionFolders.map(f =>
        f.id === folderId ? { ...f, name } : f
      ),
    }))
    get().markWorkspaceDirty()
  },

  toggleFolderCollapsed: (folderId) => {
    set(state => ({
      sessionFolders: state.sessionFolders.map(f =>
        f.id === folderId ? { ...f, collapsed: !f.collapsed } : f
      ),
    }))
  },

  moveSessionToFolder: (sessionId, folderId) => {
    set(state => {
      // Remove from all folders first
      let folders = state.sessionFolders.map(f => ({
        ...f,
        sessionIds: f.sessionIds.filter(sid => sid !== sessionId),
      }))
      // Add to target folder if specified
      if (folderId) {
        folders = folders.map(f =>
          f.id === folderId
            ? { ...f, sessionIds: [...f.sessionIds, sessionId] }
            : f
        )
      }
      return { sessionFolders: folders }
    })
    get().markWorkspaceDirty()
  },

  moveSessionsToFolder: (sessionIds, folderId) => {
    set(state => {
      const idSet = new Set(sessionIds)
      // Remove from all folders first
      let folders = state.sessionFolders.map(f => ({
        ...f,
        sessionIds: f.sessionIds.filter(sid => !idSet.has(sid)),
      }))
      // Add to target folder if specified
      if (folderId) {
        folders = folders.map(f =>
          f.id === folderId
            ? { ...f, sessionIds: [...f.sessionIds, ...sessionIds] }
            : f
        )
      }
      return { sessionFolders: folders }
    })
    get().markWorkspaceDirty()
  },

  moveFolderToFolder: (folderId, targetParentId) => {
    // Prevent moving a folder into itself or a descendant
    const state = get()
    function isDescendant(parentId: string, childId: string): boolean {
      for (const f of state.sessionFolders) {
        if (f.parentId === parentId && f.id === childId) return true
        if (f.parentId === parentId && isDescendant(f.id, childId)) return true
      }
      return false
    }
    if (targetParentId && (folderId === targetParentId || isDescendant(folderId, targetParentId))) return

    set(state => ({
      sessionFolders: state.sessionFolders.map(f =>
        f.id === folderId ? { ...f, parentId: targetParentId } : f
      ),
    }))
    get().markWorkspaceDirty()
  },

  removeSessionFromAllFolders: (sessionId) => {
    set(state => ({
      sessionFolders: state.sessionFolders.map(f => ({
        ...f,
        sessionIds: f.sessionIds.filter(sid => sid !== sessionId),
      })),
    }))
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
