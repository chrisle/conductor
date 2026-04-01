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
    jiraSpaceKeys: [],
    jiraConnectionId: null,
    projectSettings: undefined,
    workspaceSettings: undefined,
    sessionTitles: {},
    sessionGroups: [],
    sessionSort: 'created',
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
      useProjectStore.getState().setJiraConfig(['KEY'], 'conn-1')
      useProjectStore.getState().clearProject()

      const state = useProjectStore.getState()
      expect(state.filePath).toBeNull()
      expect(state.name).toBeNull()
      expect(state.activeWorkspace).toBeNull()
      expect(state.workspaceNames).toEqual([])
      expect(state.dirtyWorkspaces.size).toBe(0)
      expect(state.jiraSpaceKeys).toEqual([])
      expect(state.jiraConnectionId).toBeNull()
      expect(state.projectSettings).toBeUndefined()
      expect(state.workspaceSettings).toBeUndefined()
      expect(state.sessionTitles).toEqual({})
      expect(state.sessionGroups).toEqual([])
      expect(state.sessionSort).toBe('created')
    })
  })

  describe('setJiraConfig', () => {
    it('sets space keys and connection id', () => {
      useProjectStore.getState().setJiraConfig(['PROJ', 'DEV'], 'conn-1')
      expect(useProjectStore.getState().jiraSpaceKeys).toEqual(['PROJ', 'DEV'])
      expect(useProjectStore.getState().jiraConnectionId).toBe('conn-1')
    })

    it('sets connectionId to null when not provided', () => {
      useProjectStore.getState().setJiraConfig(['KEY'])
      expect(useProjectStore.getState().jiraConnectionId).toBeNull()
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

  describe('session groups', () => {
    beforeEach(() => {
      useProjectStore.getState().setActiveWorkspace('default')
    })

    it('addSessionGroup creates a group and returns its id', () => {
      const id = useProjectStore.getState().addSessionGroup('Dev', ['s1', 's2'])
      expect(id).toBeTruthy()
      const groups = useProjectStore.getState().sessionGroups
      expect(groups).toHaveLength(1)
      expect(groups[0].name).toBe('Dev')
      expect(groups[0].sessionIds).toEqual(['s1', 's2'])
    })

    it('addSessionGroup removes sessions from existing groups', () => {
      useProjectStore.getState().addSessionGroup('Group1', ['s1', 's2'])
      useProjectStore.getState().addSessionGroup('Group2', ['s2', 's3'])
      const groups = useProjectStore.getState().sessionGroups
      expect(groups[0].sessionIds).toEqual(['s1'])
      expect(groups[1].sessionIds).toEqual(['s2', 's3'])
    })

    it('removeSessionGroup removes a group', () => {
      const id = useProjectStore.getState().addSessionGroup('Group', ['s1'])
      useProjectStore.getState().removeSessionGroup(id)
      expect(useProjectStore.getState().sessionGroups).toHaveLength(0)
    })

    it('renameSessionGroup renames a group', () => {
      const id = useProjectStore.getState().addSessionGroup('Old', ['s1'])
      useProjectStore.getState().renameSessionGroup(id, 'New')
      expect(useProjectStore.getState().sessionGroups[0].name).toBe('New')
    })

    it('addSessionsToGroup merges sessions and removes from others', () => {
      const g1 = useProjectStore.getState().addSessionGroup('G1', ['s1', 's2'])
      const g2 = useProjectStore.getState().addSessionGroup('G2', ['s3'])
      useProjectStore.getState().addSessionsToGroup(g2, ['s2', 's4'])
      const groups = useProjectStore.getState().sessionGroups
      const group1 = groups.find(g => g.id === g1)!
      const group2 = groups.find(g => g.id === g2)!
      expect(group1.sessionIds).toEqual(['s1'])
      expect(group2.sessionIds).toContain('s2')
      expect(group2.sessionIds).toContain('s3')
      expect(group2.sessionIds).toContain('s4')
    })

    it('removeSessionFromGroup removes a single session', () => {
      const id = useProjectStore.getState().addSessionGroup('G', ['s1', 's2', 's3'])
      useProjectStore.getState().removeSessionFromGroup(id, 's2')
      const group = useProjectStore.getState().sessionGroups[0]
      expect(group.sessionIds).toEqual(['s1', 's3'])
    })

    it('setSessionGroups replaces all groups', () => {
      useProjectStore.getState().addSessionGroup('Old', ['s1'])
      useProjectStore.getState().setSessionGroups([
        { id: 'g1', name: 'New', sessionIds: ['x1'] },
      ])
      expect(useProjectStore.getState().sessionGroups).toHaveLength(1)
      expect(useProjectStore.getState().sessionGroups[0].id).toBe('g1')
    })
  })

  describe('session sort', () => {
    beforeEach(() => {
      useProjectStore.getState().setActiveWorkspace('default')
    })

    it('defaults to created', () => {
      expect(useProjectStore.getState().sessionSort).toBe('created')
    })

    it('setSessionSort changes sort order and marks dirty', () => {
      useProjectStore.getState().setSessionSort('alpha')
      expect(useProjectStore.getState().sessionSort).toBe('alpha')
      expect(useProjectStore.getState().isWorkspaceDirty()).toBe(true)
    })

    it('supports all sort modes', () => {
      for (const mode of ['created', 'alpha', 'activity', 'attached'] as const) {
        useProjectStore.getState().setSessionSort(mode)
        expect(useProjectStore.getState().sessionSort).toBe(mode)
      }
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
      useProjectStore.getState().setProjectSettings({ terminal: { tmuxMouse: true } })
      expect(useProjectStore.getState().projectSettings).toEqual({
        terminal: { tmuxMouse: true },
      })
    })

    it('setWorkspaceSettings stores settings', () => {
      useProjectStore.getState().setWorkspaceSettings({ terminal: { tmuxMouse: false } })
      expect(useProjectStore.getState().workspaceSettings).toEqual({
        terminal: { tmuxMouse: false },
      })
    })

    it('settings can be cleared with undefined', () => {
      useProjectStore.getState().setProjectSettings({ terminal: { tmuxMouse: true } })
      useProjectStore.getState().setProjectSettings(undefined)
      expect(useProjectStore.getState().projectSettings).toBeUndefined()
    })
  })
})
