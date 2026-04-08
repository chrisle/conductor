import { Page } from '@playwright/test'
import { KITCHEN_SINK_MANIFEST, buildKitchenSinkBundle } from './fixtures/kitchen-sink-extension'

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

    let mockSessions: any[] = []
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
      /** Set sessions returned by conductordGetSessions */
      setSessions(sessions: any[]) { mockSessions = sessions },
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
      onCloseTabRequested: () => {},
      offCloseTabRequested: () => {},

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
      captureScrollback: async () => null,
      onTerminalData: (cb: Function) => { dataListeners.add(cb) },
      offTerminalData: (cb: Function) => { dataListeners.delete(cb) },
      onTerminalExit: (cb: Function) => { exitListeners.add(cb) },
      offTerminalExit: (cb: Function) => { exitListeners.delete(cb) },

      // Git
      gitShortstat: async () => ({ insertions: 0, deletions: 0 }),
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
      selectExtensionDir: async () => null,
      installUnpackedExtension: async () => ({ success: false, error: 'test' }),
      onExtensionInstalled: () => () => {},
      openNewWindow: noop,

      // Conductord
      watchConductordLogs: async () => 'mock',
      unwatchConductordLogs: noop,
      onConductordLogs: () => {},
      offConductordLogs: () => {},
      conductordHealth: async () => true,
      conductordGetSessions: async () => mockSessions,

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

/** Set the sessions returned by the conductordGetSessions mock. */
export async function setSessions(
  page: Page,
  sessions: Array<{
    id: string
    dead?: boolean
    command?: string
    cwd?: string
  }>,
) {
  const filled = sessions.map(s => ({
    dead: false,
    command: '/bin/zsh',
    cwd: '/tmp',
    ...s,
  }))
  await page.evaluate(
    (data) => (window as any).__testTerminal__.setSessions(data),
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
  // TerminalTab → xterm) is connected. Use .first() so this works even when
  // multiple terminal tabs are open simultaneously.
  await page.locator('.xterm').first().waitFor({ state: 'attached', timeout: 5000 })
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

const EXT_DIR = '/tmp/extensions/kitchen-sink-test'

/**
 * Load the kitchen sink test extension into the running app.
 *
 * Overrides the readFile mock to serve the manifest and bundle for
 * the test extension path, then calls loadExtension via __stores__.
 */
export async function loadKitchenSinkExtension(page: Page) {
  const manifest = JSON.stringify(KITCHEN_SINK_MANIFEST)
  const bundle = buildKitchenSinkBundle()

  await page.evaluate(
    ({ dir, manifest, bundle }) => {
      const original = window.electronAPI.readFile.bind(window.electronAPI)
      window.electronAPI.readFile = async (path: string) => {
        if (path === `${dir}/manifest.json`) {
          return { success: true, content: manifest }
        }
        if (path === `${dir}/index.js`) {
          return { success: true, content: bundle }
        }
        return original(path)
      }
    },
    { dir: EXT_DIR, manifest, bundle },
  )

  // Call the real loadExtension (exposed on __stores__)
  await page.evaluate(
    (dir) => (window as any).__stores__.loadExtension(dir),
    EXT_DIR,
  )

  // Wait for the extension to be registered
  await page.waitForFunction(
    () => {
      const reg = (window as any).__stores__.extensionRegistry
      return reg && reg.getExtension('kitchen-sink-test')
    },
    null,
    { timeout: 5000 },
  )
}
