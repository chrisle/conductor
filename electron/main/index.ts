import { app, BrowserWindow, dialog, shell, screen } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { spawn } from 'child_process'
import { registerIpcHandlers } from './ipc'
import * as service from './service'
import { conductordHealthCheck, CONDUCTORD_SOCKET } from './conductord-client'
import os from 'os'

let mainWindow: BrowserWindow | null = null

// ── Window bounds persistence ──────────────────────────

const BOUNDS_FILE = join(os.homedir(), '.conductor', 'window-bounds.json')

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

function loadWindowBounds(): Partial<WindowBounds> {
  try {
    return JSON.parse(readFileSync(BOUNDS_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function saveWindowBounds(win: BrowserWindow): void {
  const isMaximized = win.isMaximized()
  // Save the normal (non-maximized) bounds so restore works correctly
  const bounds = isMaximized ? win.getNormalBounds() : win.getBounds()
  const data: WindowBounds = { ...bounds, isMaximized }
  try {
    mkdirSync(join(os.homedir(), '.conductor'), { recursive: true })
    writeFileSync(BOUNDS_FILE, JSON.stringify(data))
  } catch {}
}

function validateBounds(bounds: Partial<WindowBounds>): Partial<WindowBounds> {
  if (bounds.x == null || bounds.y == null) return bounds
  // Ensure the window is at least partially visible on a display
  const displays = screen.getAllDisplays()
  const visible = displays.some(d => {
    const { x, y, width, height } = d.workArea
    return (
      (bounds.x! + (bounds.width ?? 0)) > x &&
      bounds.x! < x + width &&
      (bounds.y! + (bounds.height ?? 0)) > y &&
      bounds.y! < y + height
    )
  })
  if (!visible) {
    // Reset position, keep size
    const { x, y, ...rest } = bounds
    return rest
  }
  return bounds
}

async function ensureConductord(): Promise<void> {
  // Check if conductord is already running
  if (await conductordHealthCheck()) {
    console.log('[conductord] already running')
    return
  }

  // If not installed as a service, prompt the user
  if (!service.isInstalled()) {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Install Service', 'Not Now'],
      defaultId: 0,
      title: 'Install conductord',
      message: 'Conductor needs a background service (conductord) to run terminals.',
      detail: 'This installs a lightweight daemon that manages terminal sessions. It runs in the background so your terminals persist even when Conductor is closed.\n\nYou can uninstall it later from Settings.'
    })

    if (response === 0) {
      const result = service.install()
      if (result.success) {
        console.log('[conductord] service installed')
        // Wait for launchd to start it
        for (let i = 0; i < 20; i++) {
          if (await conductordHealthCheck()) {
            console.log('[conductord] service started')
            return
          }
          await new Promise(r => setTimeout(r, 200))
        }
        console.warn('[conductord] service installed but not responding yet')
        return
      } else {
        console.error('[conductord] service install failed:', result.error)
      }
    }
  } else {
    // Service is already installed — launchd should be managing it.
    // Wait longer for launchd to (re)start it instead of spawning a duplicate.
    console.log('[conductord] service installed, waiting for launchd to start it...')
    for (let i = 0; i < 30; i++) {
      if (await conductordHealthCheck()) {
        console.log('[conductord] service started via launchd')
        return
      }
      await new Promise(r => setTimeout(r, 200))
    }
    // Try kickstarting it
    try {
      service.restart()
      for (let i = 0; i < 20; i++) {
        if (await conductordHealthCheck()) {
          console.log('[conductord] service started after kickstart')
          return
        }
        await new Promise(r => setTimeout(r, 200))
      }
    } catch {}
    console.warn('[conductord] launchd service not responding, falling back to direct spawn')
  }

  // Fallback: start conductord as a detached process for this session
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  const binPath = isDev
    ? join(__dirname, '../../conductord/conductord')
    : join(process.resourcesPath!, 'conductord')

  const child = spawn(binPath, ['-socket', CONDUCTORD_SOCKET], {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env }
  })
  child.unref()

  for (let i = 0; i < 20; i++) {
    if (await conductordHealthCheck()) {
      console.log('[conductord] started (pid %d)', child.pid)
      return
    }
    await new Promise(r => setTimeout(r, 100))
  }
  console.error('[conductord] failed to start within 2s')
}

function createWindow(): void {
  const saved = validateBounds(loadWindowBounds())

  mainWindow = new BrowserWindow({
    width: saved.width ?? 1400,
    height: saved.height ?? 900,
    x: saved.x,
    y: saved.y,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#09090b',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (saved.isMaximized) mainWindow?.maximize()
    mainWindow?.show()
  })

  // Persist bounds on move/resize (debounced)
  let boundsTimer: ReturnType<typeof setTimeout> | null = null
  const debounceSaveBounds = () => {
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) saveWindowBounds(mainWindow)
    }, 500)
  }
  mainWindow.on('resize', debounceSaveBounds)
  mainWindow.on('move', debounceSaveBounds)
  mainWindow.on('maximize', debounceSaveBounds)
  mainWindow.on('unmaximize', debounceSaveBounds)

  mainWindow.on('close', (e) => {
    if (mainWindow && !mainWindow.isDestroyed()) saveWindowBounds(mainWindow)
    e.preventDefault()
    mainWindow?.webContents.send('window:closeRequested')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await ensureConductord()
  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export { mainWindow }
