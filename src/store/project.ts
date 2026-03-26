import { create } from 'zustand'
import type { LayoutNode } from './layout'

export interface SerializedTab {
  id: string
  type: string
  title: string
  filePath?: string
  url?: string
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
}

/** The serialized format written to .conductor files */
export interface ConductorProject {
  version: 2
  name: string
  activeWorkspace: string
  workspaces: Record<string, Workspace>
  sidebar: {
    rootPath: string | null
    expandedPaths: string[]
  }
  activeExtensionId: string | null
}

interface ProjectState {
  filePath: string | null
  name: string | null
  activeWorkspace: string | null
  workspaceNames: string[]
  isDirty: boolean
  recentProjects: Array<{ name: string; path: string }>
  setProject: (filePath: string, name: string) => void
  clearProject: () => void
  setActiveWorkspace: (name: string) => void
  setWorkspaceNames: (names: string[]) => void
  setDirty: (dirty: boolean) => void
  addRecentProject: (name: string, path: string) => void
  loadRecentProjects: () => Promise<void>
  saveRecentProjects: () => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  filePath: null,
  name: null,
  activeWorkspace: null,
  workspaceNames: [],
  isDirty: false,
  recentProjects: [],

  setProject: (filePath, name) => {
    set({ filePath, name, isDirty: false })
    get().addRecentProject(name, filePath)
  },

  clearProject: () => set({ filePath: null, name: null, activeWorkspace: null, workspaceNames: [], isDirty: false }),

  setActiveWorkspace: (name) => set({ activeWorkspace: name }),

  setWorkspaceNames: (names) => set({ workspaceNames: names }),

  setDirty: (dirty) => set({ isDirty: dirty }),

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
