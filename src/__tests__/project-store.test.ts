import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useProjectStore } from '../store/project'

function resetStore() {
  useProjectStore.setState({
    filePath: null,
    name: null,
    activeWorkspace: null,
    workspaceNames: [],
    dirtyWorkspaces: new Set(),
    recentProjects: [],
    providerProjectKeys: [],
    providerConnectionId: null,
    projectSettings: undefined,
    workspaceSettings: undefined,
    sessionTitles: {},
    sessionFolders: [],
  })
}

describe('useProjectStore', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  describe('setProject', () => {
    it('sets filePath and name', () => {
      useProjectStore.getState().setProject('/path/to/project.conductor', 'My Project')
      expect(useProjectStore.getState().filePath).toBe('/path/to/project.conductor')
      expect(useProjectStore.getState().name).toBe('My Project')
    })

    it('clears dirty workspaces', () => {
      useProjectStore.setState({ dirtyWorkspaces: new Set(['ws1']) })
      useProjectStore.getState().setProject('/path', 'Proj')
      expect(useProjectStore.getState().dirtyWorkspaces.size).toBe(0)
    })

    it('adds to recent projects', () => {
      useProjectStore.getState().setProject('/path', 'Proj')
      expect(useProjectStore.getState().recentProjects[0]).toEqual({
        name: 'Proj',
        path: '/path',
      })
    })
  })

  describe('setName', () => {
    it('updates the project name', () => {
      useProjectStore.getState().setProject('/path', 'Old')
      useProjectStore.getState().setName('New')
      expect(useProjectStore.getState().name).toBe('New')
    })

    it('updates recent projects with new name', () => {
      useProjectStore.getState().setProject('/path', 'Old')
      useProjectStore.getState().setName('New')
      expect(useProjectStore.getState().recentProjects[0].name).toBe('New')
    })
  })

  describe('clearProject', () => {
    it('resets all project state', () => {
      useProjectStore.getState().setProject('/path', 'Proj')
      useProjectStore.getState().setActiveWorkspace('ws1')
      useProjectStore.getState().setProviderConfig(['KEY'], 'conn-1')
      useProjectStore.getState().clearProject()

      const state = useProjectStore.getState()
      expect(state.filePath).toBeNull()
      expect(state.name).toBeNull()
      expect(state.activeWorkspace).toBeNull()
      expect(state.workspaceNames).toEqual([])
      expect(state.dirtyWorkspaces.size).toBe(0)
      expect(state.providerProjectKeys).toEqual([])
      expect(state.providerConnectionId).toBeNull()
      expect(state.projectSettings).toBeUndefined()
      expect(state.workspaceSettings).toBeUndefined()
      expect(state.sessionTitles).toEqual({})
      expect(state.sessionFolders).toEqual([])
    })
  })

  describe('setProviderConfig', () => {
    it('sets space keys and connection id', () => {
      useProjectStore.getState().setProviderConfig(['PROJ', 'DEV'], 'conn-1')
      expect(useProjectStore.getState().providerProjectKeys).toEqual(['PROJ', 'DEV'])
      expect(useProjectStore.getState().providerConnectionId).toBe('conn-1')
    })

    it('sets connectionId to null when not provided', () => {
      useProjectStore.getState().setProviderConfig(['KEY'])
      expect(useProjectStore.getState().providerConnectionId).toBeNull()
    })
  })

  describe('workspace management', () => {
    it('setActiveWorkspace sets the active workspace', () => {
      useProjectStore.getState().setActiveWorkspace('default')
      expect(useProjectStore.getState().activeWorkspace).toBe('default')
    })

    it('setWorkspaceNames sets the workspace name list', () => {
      useProjectStore.getState().setWorkspaceNames(['default', 'dev', 'staging'])
      expect(useProjectStore.getState().workspaceNames).toEqual(['default', 'dev', 'staging'])
    })
  })

  describe('dirty workspace tracking', () => {
    beforeEach(() => {
      useProjectStore.getState().setActiveWorkspace('default')
    })

    it('markWorkspaceDirty marks the active workspace', () => {
      useProjectStore.getState().markWorkspaceDirty()
      expect(useProjectStore.getState().isWorkspaceDirty()).toBe(true)
    })

    it('markWorkspaceDirty marks a specific workspace', () => {
      useProjectStore.getState().markWorkspaceDirty('other')
      expect(useProjectStore.getState().isWorkspaceDirty('other')).toBe(true)
      expect(useProjectStore.getState().isWorkspaceDirty('default')).toBe(false)
    })

    it('clearWorkspaceDirty clears the active workspace', () => {
      useProjectStore.getState().markWorkspaceDirty()
      useProjectStore.getState().clearWorkspaceDirty()
      expect(useProjectStore.getState().isWorkspaceDirty()).toBe(false)
    })

    it('clearWorkspaceDirty clears a specific workspace', () => {
      useProjectStore.getState().markWorkspaceDirty('ws1')
      useProjectStore.getState().markWorkspaceDirty('ws2')
      useProjectStore.getState().clearWorkspaceDirty('ws1')
      expect(useProjectStore.getState().isWorkspaceDirty('ws1')).toBe(false)
      expect(useProjectStore.getState().isWorkspaceDirty('ws2')).toBe(true)
    })

    it('isAnyDirty returns true when any workspace is dirty', () => {
      expect(useProjectStore.getState().isAnyDirty()).toBe(false)
      useProjectStore.getState().markWorkspaceDirty('ws1')
      expect(useProjectStore.getState().isAnyDirty()).toBe(true)
    })

    it('markWorkspaceDirty does nothing when no active workspace and no name given', () => {
      useProjectStore.getState().setActiveWorkspace(null as any)
      useProjectStore.getState().markWorkspaceDirty()
      expect(useProjectStore.getState().isAnyDirty()).toBe(false)
    })
  })

  describe('reorderWorkspace', () => {
    it('moves a workspace from one index to another', () => {
      useProjectStore.getState().setWorkspaceNames(['a', 'b', 'c', 'd'])
      useProjectStore.getState().reorderWorkspace(3, 1)
      expect(useProjectStore.getState().workspaceNames).toEqual(['a', 'd', 'b', 'c'])
    })

    it('moves first to last', () => {
      useProjectStore.getState().setWorkspaceNames(['a', 'b', 'c'])
      useProjectStore.getState().reorderWorkspace(0, 2)
      expect(useProjectStore.getState().workspaceNames).toEqual(['b', 'c', 'a'])
    })
  })

  describe('renameWorkspaceInStore', () => {
    it('renames a workspace in the list', () => {
      useProjectStore.getState().setWorkspaceNames(['old', 'other'])
      useProjectStore.getState().renameWorkspaceInStore('old', 'new')
      expect(useProjectStore.getState().workspaceNames).toEqual(['new', 'other'])
    })

    it('updates activeWorkspace if it was the renamed one', () => {
      useProjectStore.getState().setWorkspaceNames(['old'])
      useProjectStore.getState().setActiveWorkspace('old')
      useProjectStore.getState().renameWorkspaceInStore('old', 'new')
      expect(useProjectStore.getState().activeWorkspace).toBe('new')
    })

    it('does not update activeWorkspace if it was different', () => {
      useProjectStore.getState().setWorkspaceNames(['a', 'b'])
      useProjectStore.getState().setActiveWorkspace('a')
      useProjectStore.getState().renameWorkspaceInStore('b', 'c')
      expect(useProjectStore.getState().activeWorkspace).toBe('a')
    })

    it('transfers dirty flag to new name', () => {
      useProjectStore.getState().markWorkspaceDirty('old')
      useProjectStore.getState().setWorkspaceNames(['old'])
      useProjectStore.getState().renameWorkspaceInStore('old', 'new')
      expect(useProjectStore.getState().dirtyWorkspaces.has('new')).toBe(true)
      expect(useProjectStore.getState().dirtyWorkspaces.has('old')).toBe(false)
    })
  })

  describe('session titles', () => {
    beforeEach(() => {
      useProjectStore.getState().setActiveWorkspace('default')
    })

    it('setSessionTitle sets a title and marks dirty', () => {
      useProjectStore.getState().setSessionTitle('tab-1', 'My Terminal')
      expect(useProjectStore.getState().sessionTitles['tab-1']).toBe('My Terminal')
      expect(useProjectStore.getState().isWorkspaceDirty()).toBe(true)
    })

    it('clearSessionTitle removes a title and marks dirty', () => {
      useProjectStore.getState().setSessionTitle('tab-1', 'Title')
      useProjectStore.getState().clearWorkspaceDirty()
      useProjectStore.getState().clearSessionTitle('tab-1')
      expect(useProjectStore.getState().sessionTitles['tab-1']).toBeUndefined()
      expect(useProjectStore.getState().isWorkspaceDirty()).toBe(true)
    })

    it('setSessionTitles replaces all titles', () => {
      useProjectStore.getState().setSessionTitles({ a: 'A', b: 'B' })
      expect(useProjectStore.getState().sessionTitles).toEqual({ a: 'A', b: 'B' })
    })
  })

  describe('session folders', () => {
    beforeEach(() => {
      useProjectStore.getState().setActiveWorkspace('default')
    })

    it('addSessionFolder creates a folder and returns its id', () => {
      const id = useProjectStore.getState().addSessionFolder('Dev', null)
      expect(id).toBeTruthy()
      const folders = useProjectStore.getState().sessionFolders
      expect(folders).toHaveLength(1)
      expect(folders[0].name).toBe('Dev')
      expect(folders[0].parentId).toBeNull()
      expect(folders[0].sessionIds).toEqual([])
    })

    it('addSessionFolder supports nesting', () => {
      const parentId = useProjectStore.getState().addSessionFolder('Parent', null)
      const childId = useProjectStore.getState().addSessionFolder('Child', parentId)
      const folders = useProjectStore.getState().sessionFolders
      expect(folders).toHaveLength(2)
      expect(folders[1].parentId).toBe(parentId)
    })

    it('removeSessionFolder removes a folder', () => {
      const id = useProjectStore.getState().addSessionFolder('Folder', null)
      useProjectStore.getState().removeSessionFolder(id)
      expect(useProjectStore.getState().sessionFolders).toHaveLength(0)
    })

    it('removeSessionFolder removes descendants', () => {
      const parentId = useProjectStore.getState().addSessionFolder('Parent', null)
      useProjectStore.getState().addSessionFolder('Child', parentId)
      useProjectStore.getState().removeSessionFolder(parentId)
      expect(useProjectStore.getState().sessionFolders).toHaveLength(0)
    })

    it('renameSessionFolder renames a folder', () => {
      const id = useProjectStore.getState().addSessionFolder('Old', null)
      useProjectStore.getState().renameSessionFolder(id, 'New')
      expect(useProjectStore.getState().sessionFolders[0].name).toBe('New')
    })

    it('moveSessionToFolder moves a session into a folder', () => {
      const fid = useProjectStore.getState().addSessionFolder('F', null)
      useProjectStore.getState().moveSessionToFolder('s1', fid)
      expect(useProjectStore.getState().sessionFolders[0].sessionIds).toEqual(['s1'])
    })

    it('moveSessionToFolder removes from previous folder', () => {
      const f1 = useProjectStore.getState().addSessionFolder('F1', null)
      const f2 = useProjectStore.getState().addSessionFolder('F2', null)
      useProjectStore.getState().moveSessionToFolder('s1', f1)
      useProjectStore.getState().moveSessionToFolder('s1', f2)
      const folders = useProjectStore.getState().sessionFolders
      expect(folders.find(f => f.id === f1)!.sessionIds).toEqual([])
      expect(folders.find(f => f.id === f2)!.sessionIds).toEqual(['s1'])
    })

    it('moveSessionsToFolder moves multiple sessions', () => {
      const fid = useProjectStore.getState().addSessionFolder('F', null)
      useProjectStore.getState().moveSessionsToFolder(['s1', 's2'], fid)
      expect(useProjectStore.getState().sessionFolders[0].sessionIds).toEqual(['s1', 's2'])
    })

    it('moveFolderToFolder reparents a folder', () => {
      const f1 = useProjectStore.getState().addSessionFolder('F1', null)
      const f2 = useProjectStore.getState().addSessionFolder('F2', null)
      useProjectStore.getState().moveFolderToFolder(f2, f1)
      expect(useProjectStore.getState().sessionFolders.find(f => f.id === f2)!.parentId).toBe(f1)
    })

    it('moveFolderToFolder prevents moving into self', () => {
      const fid = useProjectStore.getState().addSessionFolder('F', null)
      useProjectStore.getState().moveFolderToFolder(fid, fid)
      expect(useProjectStore.getState().sessionFolders[0].parentId).toBeNull()
    })

    it('removeSessionFromAllFolders removes a session everywhere', () => {
      const f1 = useProjectStore.getState().addSessionFolder('F1', null)
      const f2 = useProjectStore.getState().addSessionFolder('F2', null)
      useProjectStore.getState().moveSessionToFolder('s1', f1)
      useProjectStore.getState().moveSessionToFolder('s1', f2)
      useProjectStore.getState().removeSessionFromAllFolders('s1')
      const folders = useProjectStore.getState().sessionFolders
      expect(folders.every(f => !f.sessionIds.includes('s1'))).toBe(true)
    })

    it('setSessionFolders replaces all folders', () => {
      useProjectStore.getState().addSessionFolder('Old', null)
      useProjectStore.getState().setSessionFolders([
        { id: 'f1', name: 'New', parentId: null, sessionIds: ['x1'], collapsed: false },
      ])
      expect(useProjectStore.getState().sessionFolders).toHaveLength(1)
      expect(useProjectStore.getState().sessionFolders[0].id).toBe('f1')
    })
  })

  describe('recent projects', () => {
    it('addRecentProject adds to the front', () => {
      useProjectStore.getState().addRecentProject('A', '/a')
      useProjectStore.getState().addRecentProject('B', '/b')
      expect(useProjectStore.getState().recentProjects[0].name).toBe('B')
      expect(useProjectStore.getState().recentProjects[1].name).toBe('A')
    })

    it('addRecentProject deduplicates by path', () => {
      useProjectStore.getState().addRecentProject('A', '/a')
      useProjectStore.getState().addRecentProject('B', '/b')
      useProjectStore.getState().addRecentProject('A updated', '/a')
      expect(useProjectStore.getState().recentProjects).toHaveLength(2)
      expect(useProjectStore.getState().recentProjects[0]).toEqual({
        name: 'A updated',
        path: '/a',
      })
    })

    it('addRecentProject caps at 10 items', () => {
      for (let i = 0; i < 15; i++) {
        useProjectStore.getState().addRecentProject(`P${i}`, `/p${i}`)
      }
      expect(useProjectStore.getState().recentProjects).toHaveLength(10)
    })

    it('loadRecentProjects hydrates from electronAPI', async () => {
      const mockProjects = [{ name: 'X', path: '/x' }]
      ;(window.electronAPI as any).loadRecentProjects.mockResolvedValue(mockProjects)
      await useProjectStore.getState().loadRecentProjects()
      expect(useProjectStore.getState().recentProjects).toEqual(mockProjects)
    })
  })

  describe('project and workspace settings', () => {
    it('setProjectSettings stores settings', () => {
      useProjectStore.getState().setProjectSettings({ terminal: {} })
      expect(useProjectStore.getState().projectSettings).toEqual({
        terminal: {},
      })
    })

    it('setWorkspaceSettings stores settings', () => {
      useProjectStore.getState().setWorkspaceSettings({ terminal: {} })
      expect(useProjectStore.getState().workspaceSettings).toEqual({
        terminal: {},
      })
    })

    it('settings can be cleared with undefined', () => {
      useProjectStore.getState().setProjectSettings({ terminal: {} })
      useProjectStore.getState().setProjectSettings(undefined)
      expect(useProjectStore.getState().projectSettings).toBeUndefined()
    })
  })
})
