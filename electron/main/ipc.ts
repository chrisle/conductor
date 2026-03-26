import { ipcMain, BrowserWindow, app, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { createTerminal, writeTerminal, resizeTerminal, killTerminal, killAllTerminals } from './terminal'
import { readDir, readFile, readFileBinary, writeFile, mkdirRecursive, deleteEntry } from './fs-handlers'

export function registerIpcHandlers(): void {
  // Window controls
  ipcMain.handle('window:minimize', () => {
    const win = BrowserWindow.getFocusedWindow()
    win?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    const win = BrowserWindow.getFocusedWindow()
    killAllTerminals()
    win?.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    const win = BrowserWindow.getFocusedWindow()
    return win?.isMaximized() ?? false
  })

  // File system
  ipcMain.handle('fs:getHomeDir', () => {
    return os.homedir()
  })

  ipcMain.handle('fs:readDir', async (_event, dirPath: string) => readDir(dirPath))

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => readFile(filePath))

  ipcMain.handle('fs:readFileBinary', async (_event, filePath: string) => readFileBinary(filePath))

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => writeFile(filePath, content))

  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      await fs.promises.rename(oldPath, newPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => mkdirRecursive(dirPath))

  ipcMain.handle('fs:delete', async (_event, filePath: string) => deleteEntry(filePath))

  ipcMain.handle('fs:autocomplete', async (_event, partial: string) => {
    try {
      // Expand ~ to home directory
      let expanded = partial
      if (expanded.startsWith('~')) {
        expanded = path.join(os.homedir(), expanded.slice(1))
      }

      const dirPart = path.dirname(expanded)
      const basePart = path.basename(expanded)

      // If the partial ends with a separator, list contents of that directory
      const endsWithSep = partial.endsWith('/') || partial.endsWith(path.sep)
      const searchDir = endsWithSep ? expanded : dirPart
      const prefix = endsWithSep ? '' : basePart

      const entries = await fs.promises.readdir(searchDir, { withFileTypes: true })
      const matches = entries
        .filter(entry => {
          if (!entry.name.startsWith(prefix)) return false
          if (entry.name.startsWith('.') && !prefix.startsWith('.')) return false
          return entry.isDirectory()
        })
        .map(entry => {
          const fullPath = path.join(searchDir, entry.name)
          // Convert back to ~ prefix if it's under home
          const home = os.homedir()
          if (partial.startsWith('~') && fullPath.startsWith(home)) {
            return '~' + fullPath.slice(home.length)
          }
          return fullPath
        })
        .sort()

      return matches
    } catch {
      return []
    }
  })

  // Favorites persistence
  const favoritesPath = path.join(app.getPath('userData'), 'favorites.json')

  ipcMain.handle('favorites:load', () => {
    try {
      return JSON.parse(fs.readFileSync(favoritesPath, 'utf-8'))
    } catch {
      return []
    }
  })

  ipcMain.handle('favorites:save', (_event, favorites: string[]) => {
    fs.writeFileSync(favoritesPath, JSON.stringify(favorites), 'utf-8')
  })

  ipcMain.handle('git:branch', (_event, dirPath: string) => {
    return new Promise<string | null>((resolve) => {
      execFile('git', ['-C', dirPath, 'branch', '--show-current'], (err, stdout) => {
        resolve(err ? null : stdout.trim() || null)
      })
    })
  })

  // Terminal
  ipcMain.handle('terminal:create', (event, id: string, cwd?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      createTerminal(id, win, cwd)
    }
  })

  ipcMain.handle('terminal:write', (_event, id: string, data: string) => {
    writeTerminal(id, data)
  })

  ipcMain.handle('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    resizeTerminal(id, cols, rows)
  })

  ipcMain.handle('terminal:kill', (_event, id: string) => {
    killTerminal(id)
  })

  ipcMain.handle('app:getCwd', () => process.cwd())

  // Git
  ipcMain.handle('git:worktreeList', (_event, repoPath: string) => {
    return new Promise<Array<{ path: string; branch: string; bare: boolean; head: string }>>((resolve) => {
      execFile('git', ['-C', repoPath, 'worktree', 'list', '--porcelain'], (err, stdout) => {
        if (err) { resolve([]); return }
        const worktrees: Array<{ path: string; branch: string; bare: boolean; head: string }> = []
        let current: any = {}
        for (const line of stdout.split('\n')) {
          if (line.startsWith('worktree ')) {
            current = { path: line.slice(9), branch: '', bare: false, head: '' }
          } else if (line.startsWith('HEAD ')) {
            current.head = line.slice(5)
          } else if (line.startsWith('branch ')) {
            current.branch = line.slice(7).replace('refs/heads/', '')
          } else if (line === 'bare') {
            current.bare = true
          } else if (line === 'detached') {
            current.branch = current.branch || '(detached)'
          } else if (line === '' && current.path) {
            worktrees.push(current)
            current = {}
          }
        }
        if (current.path) worktrees.push(current)
        resolve(worktrees)
      })
    })
  })

  ipcMain.handle('git:worktreeAdd', (_event, repoPath: string, branchName: string, basePath?: string) => {
    const worktreePath = basePath
      ? path.join(basePath, branchName)
      : path.join(path.dirname(repoPath), path.basename(repoPath) + '-' + branchName)
    return new Promise<{ success: boolean; path?: string; error?: string }>((resolve) => {
      execFile('git', ['-C', repoPath, 'worktree', 'add', '-b', branchName, worktreePath], (err) => {
        if (err) {
          // Branch might already exist, try without -b
          execFile('git', ['-C', repoPath, 'worktree', 'add', worktreePath, branchName], (err2) => {
            if (err2) resolve({ success: false, error: err2.message })
            else resolve({ success: true, path: worktreePath })
          })
        } else {
          resolve({ success: true, path: worktreePath })
        }
      })
    })
  })

  // Projects
  const recentProjectsPath = path.join(app.getPath('userData'), 'recent-projects.json')

  ipcMain.handle('project:selectDirectory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Directory',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('project:saveDialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      title: 'Save Project',
      filters: [{ name: 'Conductor Project', extensions: ['conductor'] }]
    })
    return result.canceled ? null : result.filePath ?? null
  })

  ipcMain.handle('project:openDialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Open Project',
      filters: [{ name: 'Conductor Project', extensions: ['conductor'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('project:loadRecent', () => {
    try {
      return JSON.parse(fs.readFileSync(recentProjectsPath, 'utf-8'))
    } catch {
      return []
    }
  })

  ipcMain.handle('project:saveRecent', (_event, projects: Array<{ name: string; path: string }>) => {
    fs.writeFileSync(recentProjectsPath, JSON.stringify(projects), 'utf-8')
  })

  // Claude sessions
  ipcMain.handle('claude:listSessions', async (_event, projectPath: string) => {
    try {
      const home = os.homedir()
      // Claude CLI uses the absolute path with / replaced by -
      const projectKey = projectPath.replace(/\//g, '-')
      const sessionsDir = path.join(home, '.claude', 'projects', projectKey)

      if (!fs.existsSync(sessionsDir)) return []

      const entries = await fs.promises.readdir(sessionsDir, { withFileTypes: true })
      const jsonlFiles = entries.filter(e => e.isFile() && e.name.endsWith('.jsonl'))

      const sessions: Array<{ id: string; mtime: number; summary: string }> = []

      for (const file of jsonlFiles) {
        const id = file.name.replace('.jsonl', '')
        const filePath = path.join(sessionsDir, file.name)
        const stat = await fs.promises.stat(filePath)

        // Read first ~8KB to find the first real user message for a summary
        let summary = ''
        try {
          const fd = await fs.promises.open(filePath, 'r')
          const buf = Buffer.alloc(8192)
          await fd.read(buf, 0, 8192, 0)
          await fd.close()
          const lines = buf.toString('utf-8').split('\n')
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const obj = JSON.parse(line)
              if (obj.type === 'user' && obj.message) {
                const content = typeof obj.message === 'string'
                  ? obj.message
                  : typeof obj.message.content === 'string'
                    ? obj.message.content
                    : ''
                // Strip XML tags and command artifacts
                const cleaned = content
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
                if (cleaned.length > 3 && !cleaned.startsWith('clear')) {
                  summary = cleaned.slice(0, 120)
                  break
                }
              }
            } catch { /* skip unparseable lines */ }
          }
        } catch { /* skip unreadable files */ }

        sessions.push({ id, mtime: stat.mtimeMs, summary: summary || id.slice(0, 8) })
      }

      // Reverse chronological
      sessions.sort((a, b) => b.mtime - a.mtime)
      return sessions
    } catch {
      return []
    }
  })

  // Extensions
  const extensionsDir = path.join(app.getPath('userData'), 'extensions')

  ipcMain.handle('extensions:getDir', () => {
    if (!fs.existsSync(extensionsDir)) {
      fs.mkdirSync(extensionsDir, { recursive: true })
    }
    return extensionsDir
  })

  ipcMain.handle('extensions:list', () => {
    if (!fs.existsSync(extensionsDir)) return []
    return fs.readdirSync(extensionsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const manifestPath = path.join(extensionsDir, d.name, 'manifest.json')
        try {
          return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        } catch {
          return null
        }
      })
      .filter(Boolean)
  })

  ipcMain.handle('extensions:install', async (_event, zipPath: string) => {
    const AdmZip = await import('adm-zip')
    const zip = new AdmZip.default(zipPath)
    const manifestEntry = zip.getEntry('manifest.json')
    if (!manifestEntry) {
      return { success: false, error: 'No manifest.json found in extension zip' }
    }

    const manifest = JSON.parse(manifestEntry.getData().toString('utf-8'))
    if (!manifest.id) {
      return { success: false, error: 'manifest.json missing id field' }
    }

    const destDir = path.join(extensionsDir, manifest.id)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }
    zip.extractAllTo(destDir, true)
    return { success: true, extensionId: manifest.id }
  })

  ipcMain.handle('extensions:uninstall', async (_event, extensionId: string) => {
    const extDir = path.join(extensionsDir, extensionId)
    if (fs.existsSync(extDir)) {
      await fs.promises.rm(extDir, { recursive: true, force: true })
      return { success: true }
    }
    return { success: false, error: 'Extension not found' }
  })

  ipcMain.handle('extensions:selectZip', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Install Extension',
      filters: [{ name: 'Extension Package', extensions: ['zip'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
