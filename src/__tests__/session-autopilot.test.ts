import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../store/project'
import {
  getSessionAutoPilot,
  setSessionAutoPilot,
  clearSessionAutoPilot,
} from '../lib/session-autopilot'

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

describe('session-autopilot', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('getSessionAutoPilot', () => {
    it('returns true when sessionAutoPilot is not on the store', () => {
      // The store currently has no sessionAutoPilot property — defaults to enabled
      expect(getSessionAutoPilot('claude-code-44')).toBe(true)
    })

    it('returns true for an unknown session ID', () => {
      expect(getSessionAutoPilot('nonexistent')).toBe(true)
    })
  })

  describe('setSessionAutoPilot', () => {
    it('does not throw when the store lacks setSessionAutoPilot', () => {
      expect(() => setSessionAutoPilot('claude-code-44', true)).not.toThrow()
    })
  })

  describe('clearSessionAutoPilot', () => {
    it('does not throw when the store lacks clearSessionAutoPilot', () => {
      expect(() => clearSessionAutoPilot('claude-code-44')).not.toThrow()
    })
  })
})
