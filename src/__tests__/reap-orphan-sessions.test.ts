import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTabsStore } from '../store/tabs'
import { reapOrphanTerminalSessions } from '../lib/reap-orphan-sessions'

const killTerminalMock = vi.fn()

vi.mock('../lib/terminal-api', () => ({
  killTerminal: (id: string) => killTerminalMock(id),
}))

describe('reapOrphanTerminalSessions', () => {
  beforeEach(() => {
    killTerminalMock.mockReset()
    useTabsStore.setState({ groups: {} })
  })

  function setSessionsList(sessions: Array<{ id: string; dead: boolean; cwd?: string; command?: string }>) {
    ;(window.electronAPI as any).conductordGetSessions = vi.fn().mockResolvedValue(
      sessions.map(s => ({ cwd: '/tmp', command: '', ...s })),
    )
  }

  it('kills claude-code-* sessions that have no matching tab', async () => {
    setSessionsList([
      { id: 'claude-code-1', dead: false },
      { id: 'claude-code-2', dead: false },
      { id: 'claude-code-3', dead: false },
    ])
    useTabsStore.setState({
      groups: { g1: { id: 'g1', tabs: [{ id: 'claude-code-2', type: 'claude-code', title: 'x' } as any], activeTabId: 'claude-code-2', tabHistory: [] } },
    })

    const killed = await reapOrphanTerminalSessions()

    expect(killed).toBe(2)
    expect(killTerminalMock).toHaveBeenCalledWith('claude-code-1')
    expect(killTerminalMock).toHaveBeenCalledWith('claude-code-3')
    expect(killTerminalMock).not.toHaveBeenCalledWith('claude-code-2')
  })

  it('kills codex-* orphans too', async () => {
    setSessionsList([{ id: 'codex-1', dead: false }])
    const killed = await reapOrphanTerminalSessions()
    expect(killed).toBe(1)
    expect(killTerminalMock).toHaveBeenCalledWith('codex-1')
  })

  it('ignores sessions with unknown prefix', async () => {
    setSessionsList([
      { id: 'terminal-1', dead: false },
      { id: '__internal-thing', dead: false },
    ])
    const killed = await reapOrphanTerminalSessions()
    expect(killed).toBe(0)
    expect(killTerminalMock).not.toHaveBeenCalled()
  })

  it('ignores already-dead sessions', async () => {
    setSessionsList([{ id: 'claude-code-1', dead: true }])
    const killed = await reapOrphanTerminalSessions()
    expect(killed).toBe(0)
    expect(killTerminalMock).not.toHaveBeenCalled()
  })

  it('kills nothing when every session has a tab', async () => {
    setSessionsList([
      { id: 'claude-code-1', dead: false },
      { id: 'codex-2', dead: false },
    ])
    useTabsStore.setState({
      groups: {
        g1: {
          id: 'g1',
          tabs: [
            { id: 'claude-code-1', type: 'claude-code', title: 'a' } as any,
            { id: 'codex-2', type: 'codex', title: 'b' } as any,
          ],
          activeTabId: 'claude-code-1',
          tabHistory: [],
        },
      },
    })
    const killed = await reapOrphanTerminalSessions()
    expect(killed).toBe(0)
    expect(killTerminalMock).not.toHaveBeenCalled()
  })
})
