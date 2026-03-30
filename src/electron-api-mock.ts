/**
 * Mock electronAPI for running in a browser (dev-web mode).
 * Terminal is backed by conductord over WebSocket (requires -dev-port flag).
 * Other Electron APIs are stubbed.
 */

const CONDUCTORD_WS = 'ws://127.0.0.1:9800/ws/terminal'
const CONDUCTORD_HTTP = 'http://127.0.0.1:9800'

const noop = () => {}
const noopAsync = async () => {}

const terminalListeners = {
  data: new Set<Function>(),
  exit: new Set<Function>(),
}

const terminalSockets = new Map<string, WebSocket>()

function createTerminalWS(id: string, cwd?: string): Promise<{ isNew: boolean }> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ id })
    if (cwd) params.set('cwd', cwd)
    const ws = new WebSocket(`${CONDUCTORD_WS}?${params}`)
    ws.binaryType = 'arraybuffer'
    let sessionResolved = false

    ws.onopen = () => {
      terminalSockets.set(id, ws)
      setTimeout(() => {
        if (!sessionResolved) {
          sessionResolved = true
          resolve({ isNew: true })
        }
      }, 2000)
    }

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'session') {
            if (!sessionResolved) {
              sessionResolved = true
              resolve({ isNew: msg.isNew !== false })
            }
            return
          }
        } catch { /* not JSON */ }
      }
      const data = typeof event.data === 'string'
        ? event.data
        : new TextDecoder().decode(event.data)
      for (const cb of terminalListeners.data) {
        cb(null, id, data)
      }
    }

    ws.onclose = () => {
      terminalSockets.delete(id)
      for (const cb of terminalListeners.exit) {
        cb(null, id)
      }
    }

    ws.onerror = () => {
      reject(new Error('conductord connection failed — is it running with -dev-port 9800?'))
    }
  })
}

function writeTerminalWS(id: string, data: string): Promise<void> {
  const ws = terminalSockets.get(id)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data }))
  }
  return Promise.resolve()
}

function resizeTerminalWS(id: string, cols: number, rows: number): Promise<void> {
  const ws = terminalSockets.get(id)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'resize', data: { cols, rows } }))
  }
  return Promise.resolve()
}

function killTerminalWS(id: string): Promise<void> {
  const ws = terminalSockets.get(id)
  if (ws) {
    ws.close()
    terminalSockets.delete(id)
  }
  return Promise.resolve()
}

const mock: ElectronAPI = {
  // Window controls
  minimize: noopAsync,
  maximize: noopAsync,
  close: noopAsync,
  forceClose: noopAsync,
  isMaximized: async () => false,
  onCloseRequested: noop,
  offCloseRequested: noop,

  // File system
  readDir: async () => [],
  readFile: async () => ({ success: false, error: 'Not available in web mode' }),
  readFileBinary: async () => ({ success: false, error: 'Not available in web mode' }),
  writeFile: async () => ({ success: false, error: 'Not available in web mode' }),
  rename: async () => ({ success: false, error: 'Not available in web mode' }),
  deleteFile: async () => ({ success: false, error: 'Not available in web mode' }),
  mkdir: async () => ({ success: false, error: 'Not available in web mode' }),
  getHomeDir: async () => '/tmp',
  autocomplete: async () => [],
  loadFavorites: async () => [],
  saveFavorites: noopAsync,
  gitBranch: async () => null,
  gitLog: async () => [],

  // App config
  loadConfig: async () => null,
  saveConfig: noopAsync,
  patchConfig: async (patch: any) => patch,

  // Cache
  loadCache: async () => null,
  saveCache: noopAsync,
  invalidateCache: noopAsync,

  // Terminal — backed by conductord WebSocket (dev-port mode)
  createTerminal: createTerminalWS,
  writeTerminal: writeTerminalWS,
  resizeTerminal: resizeTerminalWS,
  killTerminal: killTerminalWS,
  setAutoPilot: noopAsync,
  setTmuxOption: noopAsync,
  onTerminalData: (cb) => { terminalListeners.data.add(cb) },
  offTerminalData: (cb) => { terminalListeners.data.delete(cb) },
  onTerminalExit: (cb) => { terminalListeners.exit.add(cb) },
  offTerminalExit: (cb) => { terminalListeners.exit.delete(cb) },

  // Git
  worktreeList: async () => [],
  worktreeAdd: async () => ({ success: false, error: 'Not available in web mode' }),

  // Claude
  getCwd: async () => '/tmp',
  listClaudeSessions: async () => [],
  getTicketBinding: async () => null,
  setTicketBinding: noopAsync,
  getAllTicketBindings: async () => ({}),
  removeTicketBinding: noopAsync,

  // Work sessions
  createWorkSession: async (session: any) => session,
  updateWorkSession: async () => null,
  getWorkSession: async () => null,
  getWorkSessionsByTicket: async () => [],
  getAllWorkSessions: async () => [],
  deleteWorkSession: noopAsync,

  // Projects
  selectDirectory: async () => null,
  saveProjectDialog: async () => null,
  openProjectDialog: async () => null,
  loadRecentProjects: async () => [],
  saveRecentProjects: noopAsync,

  // Claude
  generateTicket: async () => ({ success: false, error: 'Not available in web mode' }),

  // Jira
  jiraFetch: async () => ({ ok: false, status: 0, body: null, error: 'Not available in web mode' }),
  jiraPost: async () => ({ ok: false, status: 0, body: null, error: 'Not available in web mode' }),

  // Extensions
  getExtensionsDir: async () => '/tmp/extensions',
  listExtensions: async () => [],
  installExtension: async () => ({ success: false, error: 'Not available in web mode' }),
  uninstallExtension: async () => ({ success: false, error: 'Not available in web mode' }),
  selectExtensionZip: async () => null,

  // Conductord log watching
  watchConductordLogs: async () => 'mock-watch',
  unwatchConductordLogs: noopAsync,
  onConductordLogs: noop,
  offConductordLogs: noop,

  // Service management
  isConductordInstalled: async () => false,
  installConductord: async () => ({ success: false, error: 'Not available in web mode' }),
  uninstallConductord: async () => ({ success: false, error: 'Not available in web mode' }),
  startConductord: async () => ({ success: false, error: 'Not available in web mode' }),
  stopConductord: async () => ({ success: false, error: 'Not available in web mode' }),
  restartConductord: async () => ({ success: false, error: 'Not available in web mode' }),
  hasFullDiskAccess: async () => false,
  openFullDiskAccessSettings: noopAsync,

  // Conductord REST proxy (dev-web mode uses direct HTTP)
  conductordHealth: async () => {
    try {
      const res = await fetch(`${CONDUCTORD_HTTP}/health`)
      return res.ok
    } catch { return false }
  },
  conductordGetSessions: async () => {
    try {
      const res = await fetch(`${CONDUCTORD_HTTP}/api/sessions`)
      return res.ok ? await res.json() : []
    } catch { return [] }
  },
  conductordGetTmuxSessions: async () => {
    try {
      const res = await fetch(`${CONDUCTORD_HTTP}/api/tmux`)
      return res.ok ? await res.json() : []
    } catch { return [] }
  },
  conductordKillTmuxSession: async (name: string) => {
    try {
      const res = await fetch(`${CONDUCTORD_HTTP}/api/tmux/${name}`, { method: 'DELETE' })
      return res.ok ? await res.json() : { ok: false }
    } catch { return { ok: false } }
  },
  conductordKillOrphanedTmux: async () => {
    try {
      const res = await fetch(`${CONDUCTORD_HTTP}/api/tmux?orphaned=1`, { method: 'DELETE' })
      return res.ok ? await res.json() : { ok: false, killed: 0 }
    } catch { return { ok: false, killed: 0 } }
  },

  // Platform
  platform: 'darwin',
}

export function installElectronAPIMock() {
  if (!window.electronAPI) {
    ;(window as any).electronAPI = mock
    console.log('[dev-web] Electron API mock installed (terminal via conductord -dev-port)')
  }
}
