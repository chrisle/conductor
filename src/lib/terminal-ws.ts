/**
 * WebSocket-based terminal transport via conductord.
 * Used by both Electron and web modes.
 *
 * Sessions are identified by the tab ID. If a session with that ID already
 * exists in conductord, the client reattaches and receives scrollback replay.
 */

const CONDUCTORD_PORT = 9800
const CONDUCTORD_URL = `ws://127.0.0.1:${CONDUCTORD_PORT}/ws/terminal`

const sockets = new Map<string, WebSocket>()
const dataListeners = new Set<(event: any, id: string, data: string) => void>()
const exitListeners = new Set<(event: any, id: string) => void>()

export function createTerminal(id: string, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams()
    params.set('id', id)
    if (cwd) params.set('cwd', cwd)
    const ws = new WebSocket(`${CONDUCTORD_URL}?${params}`)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      sockets.set(id, ws)
      resolve()
    }

    ws.onmessage = (event) => {
      // String messages are JSON control messages from conductord
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'session') return // session ID ack, ignore
          if (msg.type === 'error') {
            console.error('[conductord]', msg.data)
            return
          }
        } catch {
          // Not JSON — treat as terminal data
        }
        for (const cb of dataListeners) {
          cb(null, id, event.data)
        }
        return
      }

      // Binary messages are terminal output
      const data = new TextDecoder().decode(event.data)
      for (const cb of dataListeners) {
        cb(null, id, data)
      }
    }

    ws.onclose = () => {
      sockets.delete(id)
      for (const cb of exitListeners) {
        cb(null, id)
      }
    }

    ws.onerror = () => {
      reject(new Error('conductord connection failed — is it running?'))
    }
  })
}

export function writeTerminal(id: string, data: string): Promise<void> {
  const ws = sockets.get(id)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data }))
  }
  return Promise.resolve()
}

export function resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
  const ws = sockets.get(id)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'resize', data: { cols, rows } }))
  }
  return Promise.resolve()
}

export function killTerminal(id: string): Promise<void> {
  const ws = sockets.get(id)
  if (ws && ws.readyState === WebSocket.OPEN) {
    // Tell conductord to kill the PTY process
    ws.send(JSON.stringify({ type: 'kill' }))
  }
  if (ws) {
    ws.close()
    sockets.delete(id)
  }
  return Promise.resolve()
}

export function onTerminalData(cb: (event: any, id: string, data: string) => void): void {
  dataListeners.add(cb)
}

export function offTerminalData(cb: (event: any, id: string, data: string) => void): void {
  dataListeners.delete(cb)
}

export function onTerminalExit(cb: (event: any, id: string) => void): void {
  exitListeners.add(cb)
}

export function offTerminalExit(cb: (event: any, id: string) => void): void {
  exitListeners.delete(cb)
}
