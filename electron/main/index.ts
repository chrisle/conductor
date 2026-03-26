import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { registerIpcHandlers } from './ipc'
import * as service from './service'

let mainWindow: BrowserWindow | null = null

async function ensureConductord(): Promise<void> {
  // Check if conductord is already running
  try {
    const res = await fetch('http://127.0.0.1:9800/health')
    if (res.ok) {
      console.log('[conductord] already running')
      return
    }
  } catch {
    // Not running
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
          try {
            const res = await fetch('http://127.0.0.1:9800/health')
            if (res.ok) {
              console.log('[conductord] service started')
              return
            }
          } catch {}
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
      try {
        const res = await fetch('http://127.0.0.1:9800/health')
        if (res.ok) {
          console.log('[conductord] service started via launchd')
          return
        }
      } catch {}
      await new Promise(r => setTimeout(r, 200))
    }
    // Try kickstarting it
    try {
      service.restart()
      for (let i = 0; i < 20; i++) {
        try {
          const res = await fetch('http://127.0.0.1:9800/health')
          if (res.ok) {
            console.log('[conductord] service started after kickstart')
            return
          }
        } catch {}
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

  const child = spawn(binPath, ['-port', '9800'], {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env }
  })
  child.unref()

  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9800/health')
      if (res.ok) {
        console.log('[conductord] started (pid %d)', child.pid)
        return
      }
    } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
  console.error('[conductord] failed to start within 2s')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
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
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
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
