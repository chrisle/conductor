import { create } from 'zustand'
import type { LayoutNode } from './layout'
import type { ProjectSettings } from '@/types/project-settings'

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
}

interface ProjectState {
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
