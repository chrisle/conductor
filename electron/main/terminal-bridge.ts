/**
 * Bridges renderer IPC to conductord terminal WebSocket connections
 * over a Unix domain socket.
 */
import { ipcMain, WebContents, app } from 'electron'
import WebSocket from 'ws'
import { CONDUCTORD_SOCKET } from './conductord-client'

interface TerminalSession {
  ws: WebSocket
  intentionalClose: boolean
  webContents: WebContents
}

const sessions = new Map<string, TerminalSession>()
const pendingConnections = new Map<string, Promise<{ isNew: boolean }>>()

export function registerTerminalBridge(): void {
  ipcMain.handle('terminal:create', async (event, id: string, cwd?: string) => {
    // If already connected, close the stale WebSocket so we get a fresh
    // connection and let conductord decide whether the tmux session is new.
    if (sessions.has(id)) {
      const old = sessions.get(id)!
      old.intentionalClose = true
      old.ws.close()
      sessions.delete(id)
    }

    // Deduplicate in-flight connection attempts for the same session
    if (pendingConnections.has(id)) {
      return pendingConnections.get(id)!
    }

    const connectionPromise = new Promise<{ isNew: boolean }>((resolve, reject) => {
      const params = new URLSearchParams()
      params.set('id', id)
      if (cwd) params.set('cwd', cwd)

      const ws = new WebSocket(`ws+unix://${CONDUCTORD_SOCKET}:/ws/terminal?${params}`)

      let sessionResolved = false
      const session: TerminalSession = {
        ws,
        intentionalClose: false,
        webContents: event.sender,
      }

      const resolveTimeout = setTimeout(() => {
        if (!sessionResolved) {
          sessionResolved = true
          resolve({ isNew: true })
        }
      }, 5000)

      ws.on('open', () => {
        sessions.set(id, session)
      })

      ws.on('message', (data: WebSocket.Data, isBinary: boolean) => {
        // Convert to string — ws v8+ delivers both text and binary frames as Buffers
        const text = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data)

        if (!isBinary) {
          // Text frame — may be JSON control message
          try {
            const msg = JSON.parse(text)
            if (msg.type === 'session') {
              if (!sessionResolved) {
                sessionResolved = true
                clearTimeout(resolveTimeout)
                resolve({ isNew: msg.isNew !== false })
              }
              return
            }
            if (msg.type === 'error') {
              console.error('[terminal-bridge]', msg.data)
              return
            }
          } catch {
            // Not JSON — treat as terminal data
          }
        }

        // Terminal output (binary frames, or non-JSON text frames)
        if (!session.webContents.isDestroyed()) {
          session.webContents.send('terminal:data', id, text)
        }
      })

      ws.on('close', () => {
        // Only remove from the map if this session is still the active one.
        // When a tab reconnects, terminal:create replaces the old session
        // before the old WebSocket's close event fires — deleting here
        // would remove the NEW session.
        if (sessions.get(id) === session) {
          sessions.delete(id)
        }
        if (!session.intentionalClose) {
          if (!session.webContents.isDestroyed()) {
            session.webContents.send('terminal:exit', id)
          }
        }
        if (!sessionResolved) {
          sessionResolved = true
          clearTimeout(resolveTimeout)
          reject(new Error('conductord connection closed before session established'))
        }
      })

      ws.on('error', (err) => {
        if (!sessionResolved) {
          sessionResolved = true
          clearTimeout(resolveTimeout)
          reject(err)
        }
      })
    })

    pendingConnections.set(id, connectionPromise)
    connectionPromise.finally(() => pendingConnections.delete(id))
    return connectionPromise
  })

  ipcMain.handle('terminal:write', async (_event, id: string, data: string) => {
    const session = sessions.get(id)
    if (session && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'input', data }))
    }
  })

  ipcMain.handle('terminal:resize', async (_event, id: string, cols: number, rows: number) => {
    const session = sessions.get(id)
    if (session && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'resize', data: { cols, rows } }))
    }
  })

  ipcMain.handle('terminal:kill', async (_event, id: string) => {
    const session = sessions.get(id)
    if (session) {
      session.intentionalClose = true
      session.ws.close()
      sessions.delete(id)
    }
  })

  ipcMain.handle('terminal:setAutoPilot', async (_event, id: string, enabled: boolean) => {
    const session = sessions.get(id)
    if (session && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'autopilot', data: enabled }))
    }
  })

  ipcMain.handle('terminal:setTmuxOption', async (_event, id: string, key: string, value: string) => {
    const session = sessions.get(id)
    if (session && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'tmux-option', data: { key, value } }))
    }
  })

  // Clean up all connections on app quit
  app.on('before-quit', () => {
    for (const [id, session] of sessions) {
      session.intentionalClose = true
      session.ws.close()
      sessions.delete(id)
    }
  })
}
