/**
 * Terminal transport via Electron IPC → conductord Unix socket.
 *
 * The Electron main process bridges WebSocket connections to conductord
 * over a Unix domain socket. The renderer communicates through IPC only —
 * no direct network connections.
 *
 * createTerminal resolves with { isNew: true } if a new process was spawned,
 * or { isNew: false } if an existing session was reattached. Callers use
 * this to decide whether to send an initialCommand.
 */

const activeSessions = new Set<string>()
const dataListeners = new Set<(event: any, id: string, data: string) => void>()
const exitListeners = new Set<(event: any, id: string) => void>()

// Bridge IPC events to local listener sets.
// Registered once — the handlers filter by whether we're tracking the session.
let ipcListenersRegistered = false

function ensureIpcListeners(): void {
  if (ipcListenersRegistered) return
  ipcListenersRegistered = true

  window.electronAPI.onTerminalData((_event, id, data) => {
    if (!activeSessions.has(id)) return
    for (const cb of dataListeners) {
      cb(null, id, data)
    }
  })

  window.electronAPI.onTerminalExit((_event, id) => {
    if (!activeSessions.has(id)) return
    activeSessions.delete(id)
    for (const cb of exitListeners) {
      cb(null, id)
    }
  })
}

export function createTerminal(id: string, cwd?: string, command?: string, shell?: string): Promise<{ isNew: boolean; autoPilot?: boolean }> {
  ensureIpcListeners()
  activeSessions.add(id)
  return window.electronAPI.createTerminal(id, cwd, command, shell)
}

export function writeTerminal(id: string, data: string, opts?: { programmatic?: boolean }): Promise<void> {
  if (!activeSessions.has(id)) return Promise.resolve()

  // For programmatic writes, delay before sending \r or \n so the
  // receiving process has time to ingest preceding input.
  if (opts?.programmatic) {
    const idx = data.search(/[\r\n]/)
    if (idx > 0) {
      window.electronAPI.writeTerminal(id, data.slice(0, idx))
      return new Promise((resolve) => {
        setTimeout(() => {
          window.electronAPI.writeTerminal(id, data.slice(idx))
          resolve()
        }, 150)
      })
    }
  }

  window.electronAPI.writeTerminal(id, data)
  return Promise.resolve()
}

export function resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
  window.electronAPI.resizeTerminal(id, cols, rows)
  return Promise.resolve()
}

export function captureScrollback(id: string): Promise<string | null> {
  return window.electronAPI.captureScrollback(id)
}

export function setAutoPilot(id: string, enabled: boolean): void {
  window.electronAPI.setAutoPilot(id, enabled)
}

export function killTerminal(id: string): Promise<void> {
  activeSessions.delete(id)
  return window.electronAPI.killTerminal(id)
}

export function onTerminalData(cb: (event: any, id: string, data: string) => void): void {
  ensureIpcListeners()
  dataListeners.add(cb)
}

export function offTerminalData(cb: (event: any, id: string, data: string) => void): void {
  dataListeners.delete(cb)
}

export function onTerminalExit(cb: (event: any, id: string) => void): void {
  ensureIpcListeners()
  exitListeners.add(cb)
}

export function offTerminalExit(cb: (event: any, id: string) => void): void {
  exitListeners.delete(cb)
}
