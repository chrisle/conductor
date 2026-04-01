import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useProjectStore } from '../store/project'
import { getSessionTitle, setSessionTitle, clearSessionTitle } from '../lib/session-titles'

function resetStore() {
  useProjectStore.setState({
    filePath: null,
    name: null,
    activeWorkspace: 'default',
    workspaceNames: ['default'],
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

describe('session-titles', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  describe('getSessionTitle', () => {
    it('returns null when no title exists', () => {
      expect(getSessionTitle('tab-1')).toBeNull()
    })

    it('returns the title when set', () => {
      useProjectStore.getState().setSessionTitle('tab-1', 'My Terminal')
      expect(getSessionTitle('tab-1')).toBe('My Terminal')
    })
  })

  describe('setSessionTitle', () => {
    it('sets a title in the project store', () => {
      setSessionTitle('tab-1', 'Custom Title')
      expect(useProjectStore.getState().sessionTitles['tab-1']).toBe('Custom Title')
    })

    it('overwrites existing title', () => {
      setSessionTitle('tab-1', 'First')
      setSessionTitle('tab-1', 'Second')
      expect(getSessionTitle('tab-1')).toBe('Second')
    })
  })

  describe('clearSessionTitle', () => {
    it('removes a title from the project store', () => {
      setSessionTitle('tab-1', 'Title')
      clearSessionTitle('tab-1')
      expect(getSessionTitle('tab-1')).toBeNull()
    })

    it('does not throw when clearing non-existent title', () => {
      expect(() => clearSessionTitle('nonexistent')).not.toThrow()
    })
  })
})
