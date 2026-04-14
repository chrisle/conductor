import { app, BrowserWindow, Menu, shell, screen } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { spawn } from 'child_process'
import { autoUpdater } from 'electron-updater'
import { registerIpcHandlers } from './ipc'
import { conductordHealthCheck, CONDUCTORD_SOCKET, CONDUCTORD_TCP_PORT } from './conductord-client'
import { initLogger } from './logger'
import { installCrashReporter } from './crash-reporter'
import os from 'os'

// Install crash handlers as early as possible so failures during startup
// (before app.whenReady) are also captured.
installCrashReporter()

let mainWindow: BrowserWindow | null = null

// ── .conductor file association ───────────────────────────
// Tracks the file path to open once the renderer is ready.
let pendingOpenFile: string | null = null

// macOS: open-file fires when a .conductor file is double-clicked in Finder.
// It may fire before the app is ready (cold launch) or while it's running.
app.on('open-file', (e, filePath) => {
  e.preventDefault()
  if (!filePath.endsWith('.conductor')) return
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('project:openFile', filePath)
    mainWindow.focus()
  } else {
    pendingOpenFile = filePath
  }
})

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
  console.debug(`[ensureConductord] socket path: ${CONDUCTORD_SOCKET}`)

  // Check if conductord is already running (previous tray instance)
  const alreadyRunning = await conductordHealthCheck()
  console.debug(`[ensureConductord] initial health check: ${alreadyRunning}`)
  if (alreadyRunning) {
    console.log('[conductord] already running')
    return
  }

  // Spawn conductord with system tray (headless on Windows — no tray yet).
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  const binName = process.platform === 'win32' ? 'conductord.exe' : 'conductord'
  const binPath = isDev
    ? join(__dirname, '../../conductord', binName)
    : join(process.resourcesPath!, binName)

  const binExists = existsSync(binPath)
  console.debug(`[ensureConductord] isDev=${isDev} binPath=${binPath} exists=${binExists}`)

  if (!binExists) {
    console.error(`[ensureConductord] conductord binary not found at ${binPath}`)
    return
  }

  const spawnArgs = ['-socket', CONDUCTORD_SOCKET, '-tray']
  if (process.platform === 'win32') {
    // Node on Windows cannot connect to AF_UNIX socket files via `socketPath`;
    // have conductord also listen on a TCP loopback port for the client.
    spawnArgs.push('-dev-port', String(CONDUCTORD_TCP_PORT))
  }
  console.debug(`[ensureConductord] spawning: ${binPath} ${spawnArgs.join(' ')}`)

  const child = spawn(binPath, spawnArgs, {
    stdio: 'inherit',
    detached: true,
    windowsHide: true,
    env: { ...process.env }
  })
  console.debug(`[ensureConductord] spawn pid=${child.pid}`)
  child.unref()

  for (let i = 0; i < 30; i++) {
    const ok = await conductordHealthCheck()
    console.debug(`[ensureConductord] poll ${i + 1}/30: health=${ok}`)
    if (ok) {
      console.log('[conductord] started with tray (pid %d)', child.pid)
      return
    }
    await new Promise(r => setTimeout(r, 100))
  }
  console.error('[conductord] failed to start within 3s')
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
    // On macOS, disable native maximize so that accidental double-clicks on
    // the drag region or Sequoia window-tiling gestures don't unexpectedly
    // maximize the window. Our IPC handler re-enables it temporarily.
    maximizable: process.platform !== 'darwin',
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
    if (saved.isMaximized) {
      mainWindow?.setMaximizable(true)
      mainWindow?.maximize()
      if (process.platform === 'darwin') {
        setTimeout(() => mainWindow?.setMaximizable(false), 200)
      }
    }
    mainWindow?.show()

    // If a .conductor file was opened before the window was ready, send it now.
    if (pendingOpenFile) {
      mainWindow?.webContents.send('project:openFile', pendingOpenFile)
      pendingOpenFile = null
    }
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
    // Open URLs in the system browser; catch errors to prevent unhandled rejections
    // (e.g. when the URL scheme has no registered handler)
    shell.openExternal(details.url).catch((err) => {
      console.error('[main] Failed to open external URL:', details.url, err)
    })
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Build a custom application menu so Cmd+W closes the active tab
// instead of the entire window (Electron's default "Close Window" behavior).
function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      role: 'appMenu' as const
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            win?.webContents.send('tab:closeRequested')
          }
        },
        { type: 'separator' as const },
        isMac ? { role: 'quit' as const } : { role: 'quit' as const }
      ]
    },
    { role: 'editMenu' as const },
    { role: 'viewMenu' as const },
    // Custom Window menu: omit the default "Close" (Cmd+W) item so it doesn't
    // compete with our "Close Tab" accelerator above.
    isMac
      ? {
          label: 'Window',
          submenu: [
            { role: 'minimize' as const },
            { role: 'zoom' as const },
            { type: 'separator' as const },
            { role: 'front' as const },
          ]
        }
      : { role: 'windowMenu' as const },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// Windows/Linux: check argv for a .conductor file passed at launch
function findConductorFileInArgs(argv: string[]): string | null {
  return argv.find(a => a.endsWith('.conductor') && !a.startsWith('-')) || null
}

// Single instance lock — if a second instance launches with a .conductor file,
// forward it to the existing window instead of opening a duplicate app.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const file = findConductorFileInArgs(argv)
    if (file && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project:openFile', file)
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(async () => {
  initLogger()
  console.log('[main] app ready, electron version:', process.versions.electron, 'node:', process.versions.node)
  if (!process.env['CONDUCTOR_SKIP_TRAY']) {
    await ensureConductord()
  }
  registerIpcHandlers()
  buildAppMenu()

  // Windows/Linux: check if a .conductor file was passed on the command line
  if (process.platform !== 'darwin' && !pendingOpenFile) {
    pendingOpenFile = findConductorFileInArgs(process.argv)
  }

  createWindow()

  // Check for updates in production only (dev builds have no publish config).
  if (!process.env['ELECTRON_RENDERER_URL']) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[updater] update check failed:', err)
    })
  }

  app.on('activate', async function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    if (!process.env['CONDUCTOR_SKIP_TRAY']) {
      await ensureConductord()
    }
  })
})

// Intercept Cmd+Q / app.quit() — ask each window to check for unsaved changes
// before allowing the quit to proceed.
app.on('before-quit', (e) => {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      e.preventDefault()
      win.webContents.send('window:closeRequested')
      return
    }
  }
})

app.on('window-all-closed', () => {
  // Always quit the Electron app when all windows close — conductord runs
  // as a detached process so its system tray keeps running independently.
  app.quit()
})

export { mainWindow }
