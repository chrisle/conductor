import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useWorkSessionsStore } from '../store/work-sessions'

function resetStore() {
  useWorkSessionsStore.setState({
    sessions: [],
    ready: false,
  })
}

describe('useWorkSessionsStore', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  describe('initialize', () => {
    it('loads sessions from electronAPI and sets ready', async () => {
      const mockSessions = [
        {
          id: 'ws-1',
          projectPath: '/proj',
          ticketKey: 'PROJ-1',
          jiraConnectionId: 'conn-1',
          worktree: null,
          tmuxSessionId: null,
          claudeSessionId: null,
          prUrl: null,
          status: 'active' as const,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ]
      vi.mocked(window.electronAPI.getAllWorkSessions).mockResolvedValue(mockSessions)
      await useWorkSessionsStore.getState().initialize()
      expect(useWorkSessionsStore.getState().sessions).toEqual(mockSessions)
      expect(useWorkSessionsStore.getState().ready).toBe(true)
    })

    it('sets ready even when load fails', async () => {
      vi.mocked(window.electronAPI.getAllWorkSessions).mockRejectedValue(new Error('fail'))
      await useWorkSessionsStore.getState().initialize()
      expect(useWorkSessionsStore.getState().ready).toBe(true)
      expect(useWorkSessionsStore.getState().sessions).toEqual([])
    })
  })

  describe('createSession', () => {
    it('creates a session with generated id and timestamps', async () => {
      const input = {
        projectPath: '/proj',
        ticketKey: 'PROJ-1',
        jiraConnectionId: 'conn-1',
        worktree: null,
        tmuxSessionId: null,
        claudeSessionId: null,
        prUrl: null,
        status: 'active' as const,
      }
      const session = await useWorkSessionsStore.getState().createSession(input)
      expect(session.id).toMatch(/^ws-/)
      expect(session.createdAt).toBeTruthy()
      expect(session.updatedAt).toBeTruthy()
      expect(session.ticketKey).toBe('PROJ-1')
      expect(window.electronAPI.createWorkSession).toHaveBeenCalledWith(session)
      expect(useWorkSessionsStore.getState().sessions).toHaveLength(1)
    })

    it('generates unique ids for multiple sessions', async () => {
      const input = {
        projectPath: '/proj',
        ticketKey: 'PROJ-1',
        jiraConnectionId: 'conn-1',
        worktree: null,
        tmuxSessionId: null,
        claudeSessionId: null,
        prUrl: null,
        status: 'active' as const,
      }
      const s1 = await useWorkSessionsStore.getState().createSession(input)
      const s2 = await useWorkSessionsStore.getState().createSession({ ...input, ticketKey: 'PROJ-2' })
      expect(s1.id).not.toBe(s2.id)
      expect(useWorkSessionsStore.getState().sessions).toHaveLength(2)
    })
  })

  describe('updateSession', () => {
    it('returns null when electronAPI returns null', async () => {
      vi.mocked(window.electronAPI.updateWorkSession).mockResolvedValue(null)
      const result = await useWorkSessionsStore.getState().updateSession('ws-1', { status: 'completed' })
      expect(result).toBeNull()
    })

    it('updates session in store when API returns updated session', async () => {
      const original = {
        id: 'ws-1',
        projectPath: '/proj',
        ticketKey: 'PROJ-1',
        jiraConnectionId: 'conn-1',
        worktree: null,
        tmuxSessionId: null,
        claudeSessionId: null,
        prUrl: null,
        status: 'active' as const,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      }
      useWorkSessionsStore.setState({ sessions: [original] })

      const updated = { ...original, status: 'completed' as const, updatedAt: '2024-01-02' }
      vi.mocked(window.electronAPI.updateWorkSession).mockResolvedValue(updated)

      const result = await useWorkSessionsStore.getState().updateSession('ws-1', { status: 'completed' })
      expect(result).toEqual(updated)
      expect(useWorkSessionsStore.getState().sessions[0].status).toBe('completed')
    })
  })

  describe('getSessionForTicket', () => {
    it('finds a session by ticket key', () => {
      useWorkSessionsStore.setState({
        sessions: [
          { id: 'ws-1', ticketKey: 'PROJ-1', status: 'active' } as any,
          { id: 'ws-2', ticketKey: 'PROJ-2', status: 'active' } as any,
        ],
      })
      const session = useWorkSessionsStore.getState().getSessionForTicket('PROJ-2')
      expect(session?.id).toBe('ws-2')
    })

    it('returns undefined when no session matches', () => {
      useWorkSessionsStore.setState({
        sessions: [{ id: 'ws-1', ticketKey: 'PROJ-1', status: 'active' } as any],
      })
      expect(useWorkSessionsStore.getState().getSessionForTicket('PROJ-99')).toBeUndefined()
    })
  })

  describe('getActiveSessionForTicket', () => {
    it('returns only active sessions', () => {
      useWorkSessionsStore.setState({
        sessions: [
          { id: 'ws-1', ticketKey: 'PROJ-1', status: 'completed' } as any,
          { id: 'ws-2', ticketKey: 'PROJ-1', status: 'active' } as any,
        ],
      })
      const session = useWorkSessionsStore.getState().getActiveSessionForTicket('PROJ-1')
      expect(session?.id).toBe('ws-2')
    })

    it('returns undefined when ticket has only completed sessions', () => {
      useWorkSessionsStore.setState({
        sessions: [
          { id: 'ws-1', ticketKey: 'PROJ-1', status: 'completed' } as any,
        ],
      })
      expect(useWorkSessionsStore.getState().getActiveSessionForTicket('PROJ-1')).toBeUndefined()
    })
  })

  describe('completeSession', () => {
    it('updates session status to completed', async () => {
      const session = {
        id: 'ws-1',
        ticketKey: 'PROJ-1',
        status: 'active' as const,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      }
      useWorkSessionsStore.setState({ sessions: [session as any] })

      const completed = { ...session, status: 'completed' as const }
      vi.mocked(window.electronAPI.updateWorkSession).mockResolvedValue(completed as any)

      await useWorkSessionsStore.getState().completeSession('ws-1')
      expect(window.electronAPI.updateWorkSession).toHaveBeenCalledWith('ws-1', { status: 'completed' })
    })
  })

  describe('deleteSession', () => {
    it('removes session from store and calls electronAPI', async () => {
      useWorkSessionsStore.setState({
        sessions: [
          { id: 'ws-1', ticketKey: 'PROJ-1' } as any,
          { id: 'ws-2', ticketKey: 'PROJ-2' } as any,
        ],
      })
      await useWorkSessionsStore.getState().deleteSession('ws-1')
      expect(window.electronAPI.deleteWorkSession).toHaveBeenCalledWith('ws-1')
      expect(useWorkSessionsStore.getState().sessions).toHaveLength(1)
      expect(useWorkSessionsStore.getState().sessions[0].id).toBe('ws-2')
    })
  })
})
