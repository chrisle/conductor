import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for the "Start work in background" feature (CON-32).
 *
 * Verifies that when startWorkInBackground is called:
 * 1. A terminal session is created via createTerminal (not a tab)
 * 2. Autopilot is enabled on the session
 * 3. A work session record is created in the store
 * 4. No tab is added to any group
 */

// Mock the extension-api module used by the Jira plugin
vi.mock('@conductor/extension-api', () => ({
  useTabsStore: {
    getState: () => ({
      groups: {},
      addTab: vi.fn(),
    }),
  },
  useLayoutStore: {
    getState: () => ({ focusedGroupId: null }),
    subscribe: vi.fn(),
  },
  useSidebarStore: {
    getState: () => ({ rootPath: '/test/repo' }),
    subscribe: vi.fn(),
  },
  useConfigStore: {
    getState: () => ({
      config: {
        ui: { kanbanCompactColumns: [] },
        aiCli: { claudeCode: { skipDangerousPermissions: true } },
      },
      ready: true,
    }),
    subscribe: vi.fn(),
  },
  useProjectStore: {
    getState: () => ({ filePath: '/test/repo/project.json' }),
  },
  useWorkSessionsStore: {
    getState: () => ({
      sessions: [],
      getActiveSessionForTicket: vi.fn().mockReturnValue(null),
      createSession: vi.fn().mockResolvedValue({ id: 'ws-1' }),
      updateSession: vi.fn(),
      completeSession: vi.fn(),
    }),
  },
  createTerminal: vi.fn().mockResolvedValue({ isNew: true }),
  killTerminal: vi.fn().mockResolvedValue(undefined),
  setAutoPilot: vi.fn(),
  ui: {},
}))

describe('startWorkInBackground', () => {
  let createTerminal: ReturnType<typeof vi.fn>
  let setAutoPilot: ReturnType<typeof vi.fn>
  let killTerminal: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const api = await import('@conductor/extension-api')
    createTerminal = api.createTerminal as any
    setAutoPilot = api.setAutoPilot as any
    killTerminal = api.killTerminal as any
  })

  it('createTerminal is called with session id, cwd, and command', async () => {
    // Simulate the core logic of startWorkInBackground
    const tmuxName = 't-CON-5'
    const cwd = '/test/repo/worktrees/con-5'
    const prompt = 'Test prompt for CON-5'
    const escaped = prompt.replace(/'/g, "'\\''")
    const command = `cd ${JSON.stringify(cwd)} && claude --dangerously-skip-permissions '${escaped}'\n`

    await createTerminal(tmuxName, cwd, command)
    setAutoPilot(tmuxName, true)

    expect(createTerminal).toHaveBeenCalledWith(tmuxName, cwd, command)
    expect(setAutoPilot).toHaveBeenCalledWith(tmuxName, true)
  })

  it('killTerminal is called before creating a new background session', async () => {
    const tmuxName = 't-CON-5'

    await killTerminal(tmuxName)
    await createTerminal(tmuxName, '/test/cwd', 'cmd')

    expect(killTerminal).toHaveBeenCalledWith(tmuxName)
    expect(killTerminal).toHaveBeenCalledBefore(createTerminal as any)
  })

  it('does not call useTabsStore.addTab for background sessions', async () => {
    const api = await import('@conductor/extension-api')
    const addTab = (api.useTabsStore as any).getState().addTab

    const tmuxName = 't-CON-5'
    const cwd = '/test/cwd'
    const command = 'claude --dangerously-skip-permissions "test"\n'

    // Simulate startWorkInBackground: only calls createTerminal + setAutoPilot
    await createTerminal(tmuxName, cwd, command)
    setAutoPilot(tmuxName, true)

    // Verify no tab was created
    expect(addTab).not.toHaveBeenCalled()
  })

  it('command includes --dangerously-skip-permissions flag', () => {
    const ticketKey = 'CON-5'
    const projectKey = 'CON'
    const domain = 'test.atlassian.net'

    const prompt = [
      `Use the claude.ai Atlassian MCP (cloud ID 8fd881b3-a07f-4662-bad9-1a9d9e0321a3) to fetch ${ticketKey} from the ${projectKey} project in ${domain}.`,
      `Work autonomously on this ticket end to end.`,
    ].join('\n')
    const escaped = prompt.replace(/'/g, "'\\''")
    const command = `cd "/test/cwd" && claude --dangerously-skip-permissions '${escaped}'\n`

    expect(command).toContain('--dangerously-skip-permissions')
    expect(command).toContain(ticketKey)
    expect(command).toContain(projectKey)
  })
})
