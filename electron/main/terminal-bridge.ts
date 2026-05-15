/**
 * Bridges renderer IPC to conductord terminal WebSocket connections
 * over a Unix domain socket.
 */
import { ipcMain, WebContents, app } from 'electron'
import { StringDecoder } from 'string_decoder'
import os from 'os'
import WebSocket from 'ws'
import { CONDUCTORD_SOCKET, CONDUCTORD_TCP_HOST, CONDUCTORD_TCP_PORT, IS_WIN, conductordFetch } from './conductord-client'
import { isTempDir } from './platform-utils'

interface TerminalSession {
  ws: WebSocket
  intentionalClose: boolean
  webContents: WebContents
  decoder: StringDecoder
  // Captured at create time so reconnectAllTerminals (after sleep/wake)
  // can re-open the WebSocket with the same parameters. Conductord will
  // reattach to the existing session by id and ignore these, but they're
  // a fallback if the daemon was restarted and lost the session.
  cwd?: string
  command?: string
  shell?: string
}

const sessions = new Map<string, TerminalSession>()
const pendingConnections = new Map<string, Promise<{ isNew: boolean; autoPilot?: boolean }>>()

function openTerminalConnection(
  id: string,
  cwd: string | undefined,
  command: string | undefined,
  shell: string | undefined,
  webContents: WebContents,
): Promise<{ isNew: boolean; autoPilot?: boolean }> {
  // If already connected, close the stale WebSocket so we get a fresh
  // connection and let conductord decide whether the session is new.
  // Also drop any in-flight connection promise tied to the old WS —
  // otherwise the dedup below would hand back a promise whose session
  // map entry we just deleted, and every subsequent write would be
  // silently discarded (sessions.get(id) → undefined).
  if (sessions.has(id)) {
    console.debug(`[terminal-bridge] closing stale session for ${id}`)
    const old = sessions.get(id)!
    old.intentionalClose = true
    old.ws.close()
    sessions.delete(id)
    pendingConnections.delete(id)
  }

  // Deduplicate in-flight connection attempts for the same session
  if (pendingConnections.has(id)) {
    console.debug(`[terminal-bridge] reusing pending connection for ${id}`)
    return pendingConnections.get(id)!
  }

  const connectionPromise = new Promise<{ isNew: boolean; autoPilot?: boolean }>((resolve, reject) => {
    // Guard: never pass a temp directory as working directory
    const safeCwd = (cwd && !isTempDir(cwd)) ? cwd : os.homedir()

    const params = new URLSearchParams()
    params.set('id', id)
    if (safeCwd) params.set('cwd', safeCwd)
    if (command) params.set('command', command)
    if (shell) params.set('shell', shell)

    const wsUrl = IS_WIN
      ? `ws://${CONDUCTORD_TCP_HOST}:${CONDUCTORD_TCP_PORT}/ws/terminal?${params}`
      : `ws+unix://${CONDUCTORD_SOCKET}:/ws/terminal?${params}`
    const ws = new WebSocket(wsUrl)

    let sessionResolved = false
    const session: TerminalSession = {
      ws,
      intentionalClose: false,
      webContents,
      decoder: new StringDecoder('utf8'),
      cwd: safeCwd,
      command,
      shell,
    }

    const resolveTimeout = setTimeout(() => {
      if (!sessionResolved) {
        sessionResolved = true
        resolve({ isNew: true })
      }
    }, 5000)

    ws.on('open', () => {
      console.debug(`[terminal-bridge] ws open for ${id}`)
      sessions.set(id, session)
    })

    ws.on('message', (data: WebSocket.Data, isBinary: boolean) => {
      // Use StringDecoder for binary frames so split multi-byte UTF-8
      // sequences are buffered across messages instead of producing U+FFFD.
      const text = Buffer.isBuffer(data) ? session.decoder.write(data) : String(data)

      if (!isBinary) {
        // Text frame — may be JSON control message
        try {
          const msg = JSON.parse(text)
          if (msg.type === 'session') {
            console.debug(`[terminal-bridge] session msg for ${id}: isNew=${msg.isNew} autoPilot=${msg.autoPilot}`)
            if (!sessionResolved) {
              sessionResolved = true
              clearTimeout(resolveTimeout)
              resolve({ isNew: msg.isNew !== false, autoPilot: msg.autoPilot === true })
            }
            return
          }
          if (msg.type === 'autopilot_match') {
            // Notify renderer that autopilot matched a prompt (before auto-response)
            if (!session.webContents.isDestroyed()) {
              session.webContents.send('terminal:autopilot_match', id, msg.response)
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
      console.debug(`[terminal-bridge] ws close for ${id}, intentional=${session.intentionalClose}`)
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
      console.debug(`[terminal-bridge] ws error for ${id}:`, err.message)
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
}

/**
 * Reopen the WebSocket for every active terminal. Called when the OS
 * resumes from sleep — sleep silently kills the WS without delivering a
 * close event, so the daemon's PTY survives but the bridge needs a fresh
 * socket. Conductord reattaches by id and replays scrollback.
 */
export async function reconnectAllTerminals(): Promise<void> {
  const ids = Array.from(sessions.keys())
  if (ids.length === 0) {
    console.log('[terminal-bridge] resume: no terminals to reconnect')
    return
  }
  console.log(`[terminal-bridge] resume: reconnecting ${ids.length} terminal(s)`)

  for (const id of ids) {
    const session = sessions.get(id)
    if (!session) continue
    const { webContents, cwd, command, shell } = session

    if (webContents.isDestroyed()) {
      // Renderer is gone — drop the dead session so we don't leak it.
      session.intentionalClose = true
      session.ws.close()
      sessions.delete(id)
      continue
    }

    webContents.send('terminal:reconnecting', id)

    try {
      const result = await openTerminalConnection(id, cwd, command, shell, webContents)
      console.log(`[terminal-bridge] reconnected ${id}: isNew=${result.isNew}`)
      if (!webContents.isDestroyed()) {
        webContents.send('terminal:reconnected', id, { isNew: result.isNew })
      }
    } catch (err) {
      console.error(`[terminal-bridge] failed to reconnect ${id}:`, err)
      if (!webContents.isDestroyed()) {
        webContents.send('terminal:exit', id)
      }
    }
  }
}

export function registerTerminalBridge(): void {
  ipcMain.handle('terminal:create', async (event, id: string, cwd?: string, command?: string, shell?: string) => {
    console.debug(`[terminal-bridge] terminal:create id=${id} cwd=${cwd} command=${command ? command.slice(0, 50) : 'none'} shell=${shell}`)
    return openTerminalConnection(id, cwd, command, shell, event.sender)
  })

  ipcMain.handle('terminal:write', async (_event, id: string, data: string) => {
    const session = sessions.get(id)
    if (session && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'input', data }))
    } else {
      // Surface silently-dropped writes in dev so this class of bug is
      // visible. A user typing and seeing nothing happen is otherwise
      // invisible from the renderer side.
      console.warn(`[terminal-bridge] dropping write for ${id}: session=${!!session} readyState=${session?.ws.readyState}`)
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
    try {
      await conductordFetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch {
      // Session may already be gone
    }
  })

  ipcMain.handle('terminal:setAutoPilot', async (_event, id: string, enabled: boolean) => {
    const session = sessions.get(id)
    if (session && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'autopilot', data: enabled }))
    }
  })

  ipcMain.handle('terminal:captureScrollback', async (_event, id: string) => {
    console.debug(`[terminal-bridge] captureScrollback requested for ${id}`)
    const session = sessions.get(id)
    if (!session || session.ws.readyState !== WebSocket.OPEN) {
      console.debug(`[terminal-bridge] captureScrollback: no session or ws not open for ${id}`)
      return null
    }

    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        console.debug(`[terminal-bridge] captureScrollback: timeout for ${id}`)
        resolve(null)
      }, 5000)

      const handler = (data: WebSocket.Data, isBinary: boolean) => {
        if (isBinary) return
        try {
          const msg = JSON.parse(String(data))
          if (msg.type === 'scrollback') {
            clearTimeout(timeout)
            session.ws.off('message', handler)
            const len = msg.data ? msg.data.length : 0
            console.debug(`[terminal-bridge] captureScrollback: received ${len} chars for ${id}`)
            resolve(msg.data ?? null)
          }
        } catch { /* not JSON */ }
      }

      session.ws.on('message', handler)
      session.ws.send(JSON.stringify({ type: 'capture-scrollback' }))
    })
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
