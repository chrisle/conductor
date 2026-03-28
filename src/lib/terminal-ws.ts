/**
 * WebSocket-based terminal transport via conductord.
 * Used by both Electron and web modes.
 *
 * When tmux is available, conductord wraps each session in a named tmux
 * session so it survives app restarts. createTerminal resolves with
 * { isNew: true } if a fresh tmux session was created, or { isNew: false }
 * if an existing session was reattached. Callers use this to decide whether
 * to send an initialCommand.
 */

const CONDUCTORD_PORT = 9800
const CONDUCTORD_URL = `ws://127.0.0.1:${CONDUCTORD_PORT}/ws/terminal`

const sockets = new Map<string, WebSocket>()
const decoders = new Map<string, TextDecoder>()
const dataListeners = new Set<(event: any, id: string, data: string) => void>()
const exitListeners = new Set<(event: any, id: string) => void>()
// Tracks sockets that were intentionally closed (tab close / detach).
// When onclose fires for these, we skip the exit event so the terminal
// doesn't show "[Process exited]" just because the tab was closed.
const intentionalClose = new Set<string>()

export function createTerminal(id: string, cwd?: string): Promise<{ isNew: boolean }> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams()
    params.set('id', id)
    if (cwd) params.set('cwd', cwd)
    const ws = new WebSocket(`${CONDUCTORD_URL}?${params}`)
    ws.binaryType = 'arraybuffer'

    // Resolved once the session message arrives (gives us isNew)
    let sessionResolved = false

    ws.onopen = () => {
      sockets.set(id, ws)
      decoders.set(id, new TextDecoder('utf-8'))
      // If conductord doesn't send a session message (old version), resolve
      // with isNew:true as a safe default so initialCommand still runs.
      setTimeout(() => {
        if (!sessionResolved) {
          sessionResolved = true
          resolve({ isNew: true })
        }
      }, 2000)
    }

    ws.onmessage = (event) => {
      // String messages are JSON control messages from conductord
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
      const decoder = decoders.get(id) || new TextDecoder('utf-8')
      const data = decoder.decode(event.data, { stream: true })
      for (const cb of dataListeners) {
        cb(null, id, data)
      }
    }

    ws.onclose = () => {
      sockets.delete(id)
      decoders.delete(id)
      // Only fire exit listeners when the close was NOT initiated by us
      // (i.e., the process actually died, not the user closing the tab)
      if (!intentionalClose.has(id)) {
        for (const cb of exitListeners) {
          cb(null, id)
        }
      }
      intentionalClose.delete(id)
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

export function setAutoPilot(id: string, enabled: boolean): void {
  const ws = sockets.get(id)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'autopilot', data: enabled }))
  }
}

export function killTerminal(id: string): Promise<void> {
  // Just close the WebSocket — the tmux session keeps running so the user
  // can continue it later. Explicit session destruction is handled via the
  // conductord REST API (DELETE /api/tmux/{name}).
  const ws = sockets.get(id)
  if (ws) {
    intentionalClose.add(id)
    ws.close()
    sockets.delete(id)
    decoders.delete(id)
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
