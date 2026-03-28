/**
 * Mock electronAPI for running in a browser (dev-web mode).
 * Terminal is backed by conductord over WebSocket.
 * Other Electron APIs are stubbed.
 */

const CONDUCTORD_URL = 'ws://127.0.0.1:9800/ws/terminal'

const noop = () => {}
const noopAsync = async () => {}

const terminalListeners = {
  data: new Set<Function>(),
  exit: new Set<Function>(),
}

const terminalSockets = new Map<string, WebSocket>()

function createTerminalWS(id: string, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = cwd ? `${CONDUCTORD_URL}?cwd=${encodeURIComponent(cwd)}` : CONDUCTORD_URL
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      terminalSockets.set(id, ws)
      resolve()
    }

    ws.onmessage = (event) => {
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
      reject(new Error('conductord connection failed — is it running?'))
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

  // App config
  loadConfig: async () => null,
  saveConfig: noopAsync,
  patchConfig: async (patch: any) => patch,

  // Cache
  loadCache: async () => null,
  saveCache: noopAsync,
  invalidateCache: noopAsync,

  // Terminal — backed by conductord WebSocket
  createTerminal: createTerminalWS,
  writeTerminal: writeTerminalWS,
  resizeTerminal: resizeTerminalWS,
  killTerminal: killTerminalWS,
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

  // Platform
  platform: 'darwin',
}

export function installElectronAPIMock() {
  if (!window.electronAPI) {
    ;(window as any).electronAPI = mock
    console.log('[dev-web] Electron API mock installed (terminal via conductord)')
  }
}
