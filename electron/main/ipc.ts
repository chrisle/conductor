import { ipcMain, BrowserWindow, app } from 'electron'
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
}
