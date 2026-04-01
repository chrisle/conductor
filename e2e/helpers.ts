import { Page } from '@playwright/test'

/**
 * Installs a complete in-memory electronAPI mock via addInitScript so it
 * runs BEFORE the app code.  Because `window.electronAPI` is already set,
 * the app's `electron-api-mock.ts` (which connects to conductord via
 * WebSocket) is skipped entirely.
 *
 * Exposes `window.__testTerminal__` for feeding data into xterm from tests.
 */
export async function installTestMocks(page: Page) {
  await page.addInitScript(() => {
    const dataListeners = new Set<Function>()
    const exitListeners = new Set<Function>()
    const writes: Array<{ id: string; data: string }> = []
    const creates: Array<{ id: string; cwd?: string; command?: string }> = []
    const knownSessions = new Set<string>()

    let mockTmuxSessions: any[] = []

    const testTerminal = {
      /** Push data into xterm as if it came from the PTY */
      feedData(id: string, data: string) {
        for (const cb of dataListeners) cb(null, id, data)
      },
      /** Signal that the process in a terminal exited */
      feedExit(id: string) {
        for (const cb of exitListeners) cb(null, id)
      },
      /** All writeTerminal calls recorded here for assertions */
      writes,
      /** All createTerminal calls recorded here for assertions */
      creates,
      /** Set tmux sessions returned by conductordGetTmuxSessions */
      setTmuxSessions(sessions: any[]) { mockTmuxSessions = sessions },
    }

    ;(window as any).__testTerminal__ = testTerminal

    const noop = async () => {}

    ;(window as any).electronAPI = {
      // Window
      minimize: noop,
      maximize: noop,
      close: noop,
      forceClose: noop,
      isMaximized: async () => false,
      onCloseRequested: () => {},
      offCloseRequested: () => {},

      // File system
      readDir: async () => [],
      readFile: async () => ({ success: false, error: 'test' }),
      readFileBinary: async () => ({ success: false, error: 'test' }),
      writeFile: async () => ({ success: false, error: 'test' }),
      rename: async () => ({ success: false, error: 'test' }),
      deleteFile: async () => ({ success: false, error: 'test' }),
      mkdir: async () => ({ success: false, error: 'test' }),
      getHomeDir: async () => '/tmp',
      autocomplete: async () => [],
      loadFavorites: async () => [],
      saveFavorites: noop,
      gitBranch: async () => null,
      gitLog: async () => [],

      // Config
      loadConfig: async () => null,
      saveConfig: noop,
      patchConfig: async (patch: any) => patch,
      loadCache: async () => null,
      saveCache: noop,
      invalidateCache: noop,

      // Terminal — pure in-memory mock, no conductord needed
      createTerminal: async (id: string, cwd?: string, command?: string) => {
        const isNew = !knownSessions.has(id)
        knownSessions.add(id)
        creates.push({ id, cwd, command })
        // Emit a shell prompt so TerminalTab's "wait for idle" logic fires
        setTimeout(() => testTerminal.feedData(id, '$ '), 50)
        return { isNew }
      },
      writeTerminal: async (id: string, data: string) => {
        writes.push({ id, data })
      },
      resizeTerminal: noop,
      killTerminal: noop,
      setAutoPilot: noop,
      setTmuxOption: noop,
      onTerminalData: (cb: Function) => { dataListeners.add(cb) },
      offTerminalData: (cb: Function) => { dataListeners.delete(cb) },
      onTerminalExit: (cb: Function) => { exitListeners.add(cb) },
      offTerminalExit: (cb: Function) => { exitListeners.delete(cb) },

      // Git
      worktreeList: async () => [],
      worktreeAdd: async () => ({ success: false, error: 'test' }),

      // Sessions / Claude
      getCwd: async () => '/tmp',
      listClaudeSessions: async () => [],
      getTicketBinding: async () => null,
      setTicketBinding: noop,
      getAllTicketBindings: async () => ({}),
      removeTicketBinding: noop,
      createWorkSession: async (s: any) => s,
      updateWorkSession: async () => null,
      getWorkSession: async () => null,
      getWorkSessionsByTicket: async () => [],
      getAllWorkSessions: async () => [],
      deleteWorkSession: noop,

      // Projects
      selectDirectory: async () => null,
      saveProjectDialog: async () => null,
      openProjectDialog: async () => null,
      loadRecentProjects: async () => [],
      saveRecentProjects: noop,

      // Claude
      generateTicket: async () => ({ success: false, error: 'test' }),

      // Jira
      jiraFetch: async () => ({ ok: false, status: 0, body: null, error: 'test' }),
      jiraPost: async () => ({ ok: false, status: 0, body: null, error: 'test' }),

      // Extensions
      getExtensionsDir: async () => '/tmp/extensions',
      listExtensions: async () => [],
      installExtension: async () => ({ success: false, error: 'test' }),
      uninstallExtension: async () => ({ success: false, error: 'test' }),
      selectExtensionZip: async () => null,

      // Conductord
      watchConductordLogs: async () => 'mock',
      unwatchConductordLogs: noop,
      onConductordLogs: () => {},
      offConductordLogs: () => {},
      conductordHealth: async () => true,
      conductordGetSessions: async () => [],
      conductordGetTmuxSessions: async () => mockTmuxSessions,
      conductordKillTmuxSession: async () => ({ ok: true }),
      conductordKillOrphanedTmux: async () => ({ ok: true, killed: 0 }),

      // Service
      isConductordInstalled: async () => true,
      installConductord: async () => ({ success: true }),
      uninstallConductord: async () => ({ success: true }),
      startConductord: async () => ({ success: true }),
      stopConductord: async () => ({ success: true }),
      restartConductord: async () => ({ success: true }),
      hasFullDiskAccess: async () => true,
      openFullDiskAccessSettings: noop,

      // Platform
      platform: 'darwin',
    }
  })
}

/** Set the tmux sessions returned by the conductordGetTmuxSessions mock. */
export async function setTmuxSessions(
  page: Page,
  sessions: Array<{
    name: string
    connected?: boolean
    command?: string
    cwd?: string
    created?: number
    activity?: number
  }>,
) {
  const now = Math.floor(Date.now() / 1000)
  const filled = sessions.map(s => ({
    connected: false,
    command: '/bin/zsh',
    cwd: '/tmp',
    created: now,
    activity: now,
    ...s,
  }))
  await page.evaluate(
    (data) => (window as any).__testTerminal__.setTmuxSessions(data),
    filled,
  )
}

/** Feed raw data into a terminal as if it came from the PTY. */
export async function feedTerminalData(page: Page, id: string, data: string) {
  await page.evaluate(
    ({ id, data }) => (window as any).__testTerminal__.feedData(id, data),
    { id, data },
  )
}

/** Wait for the app's Zustand stores and layout to initialize. */
export async function waitForApp(page: Page) {
  await page.goto('/')
  await page.waitForFunction(
    () => {
      const stores = (window as any).__stores__
      return stores && stores.layout.getState().root !== null
    },
    null,
    { timeout: 8000 },
  )
}

/**
 * Add a tab via the store and return its ID.
 * Waits for xterm to mount AND for the terminal session to be fully
 * connected (mock prompt '$ ' rendered), which ensures data can flow.
 */
export async function addTerminalTab(
  page: Page,
  opts: { type?: string; title?: string; initialCommand?: string } = {},
) {
  const tabId = await page.evaluate((opts) => {
    const { tabs, layout } = (window as any).__stores__
    const groupId = layout.getState().getAllGroupIds()[0]
    return tabs.getState().addTab(groupId, {
      type: opts.type ?? 'terminal',
      title: opts.title ?? 'Terminal',
      initialCommand: opts.initialCommand,
    })
  }, opts)

  // Wait for xterm to attach AND for the mock's initial '$ ' prompt to
  // render, confirming the full data pipeline (mock → terminal-ws bridge →
  // TerminalTab → xterm) is connected.
  await page.locator('.xterm').waitFor({ state: 'attached', timeout: 5000 })
  await page.waitForFunction(
    () => {
      const rows = document.querySelector('.xterm-rows')
      return rows && rows.textContent && rows.textContent.trim().length > 0
    },
    null,
    { timeout: 5000 },
  )
  return tabId
}
