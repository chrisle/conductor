import { ipcMain, BrowserWindow, app, dialog, shell, webContents } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { readDir, readFile, readFileBinary, writeFile, mkdirRecursive, deleteEntry } from './fs-handlers'

import { conductordFetch } from './conductord-client'
import { registerTerminalBridge } from './terminal-bridge'
import { worktreeAdd } from './worktree'
import { debugLog } from './logger'
import { getJsonlPath, readJsonlTail, computeSessionMetrics } from './claude-session-metrics'

// Conductord log watchers: watchId -> { watcher, fd }
const logWatchers = new Map<string, { watcher: fs.FSWatcher; offset: number; logPath: string }>()
let logWatchCounter = 0

export function registerIpcHandlers(): void {
  // Window controls
  ipcMain.handle('window:minimize', () => {
    const win = BrowserWindow.getFocusedWindow()
    win?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return
    // On macOS, maximizable is disabled to prevent accidental OS-triggered
    // maximize. Temporarily re-enable it for our explicit toggle.
    const needsToggle = process.platform === 'darwin' && !win.isMaximizable()
    if (needsToggle) win.setMaximizable(true)
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    if (needsToggle) setTimeout(() => { if (!win.isDestroyed()) win.setMaximizable(false) }, 200)
  })

  ipcMain.handle('window:close', () => {
    const win = BrowserWindow.getFocusedWindow()
    // Ask the renderer to check for dirty state
    win?.webContents.send('window:closeRequested')
  })

  ipcMain.handle('window:forceClose', () => {
    const win = BrowserWindow.getFocusedWindow()
    win?.destroy()
  })

  ipcMain.handle('window:isMaximized', () => {
    const win = BrowserWindow.getFocusedWindow()
    return win?.isMaximized() ?? false
  })

  ipcMain.handle('window:openNew', () => {
    const newWin = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      frame: false,
      maximizable: process.platform !== 'darwin',
      transparent: false,
      backgroundColor: '#09090b',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true,
        webviewTag: true,
        webSecurity: true,
      },
    })
    newWin.once('ready-to-show', () => newWin.show())
    newWin.on('close', (e) => {
      e.preventDefault()
      newWin.webContents.send('window:closeRequested')
    })
    newWin.webContents.setWindowOpenHandler((details) => {
      // Open URLs in the system browser; catch errors to prevent unhandled rejections
      // (e.g. when the URL scheme has no registered handler)
      shell.openExternal(details.url).catch((err) => {
        console.error('[ipc] Failed to open external URL:', details.url, err)
      })
      return { action: 'deny' }
    })
    // Pass newWindow flag so the renderer creates a fresh project instead of
    // restoring the autosaved layout from the first window.
    if (process.env['ELECTRON_RENDERER_URL']) {
      const url = new URL(process.env['ELECTRON_RENDERER_URL'])
      url.searchParams.set('newWindow', '1')
      newWin.loadURL(url.toString())
    } else {
      newWin.loadFile(path.join(__dirname, '../renderer/index.html'), {
        query: { newWindow: '1' },
      })
    }
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

  // App config persistence
  const configPath = path.join(app.getPath('userData'), 'config.json')

  function loadAppConfig(): any {
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      }
    } catch {}
    return null
  }

  function saveAppConfig(config: any): void {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  function deepMerge(target: any, source: any): any {
    const result = { ...target }
    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(result[key], source[key])
      } else {
        result[key] = source[key]
      }
    }
    return result
  }

  ipcMain.handle('config:load', () => {
    return loadAppConfig()
  })

  ipcMain.handle('config:save', (_event, config: any) => {
    saveAppConfig(config)
  })

  ipcMain.handle('config:patch', (_event, patch: any) => {
    const existing = loadAppConfig() || {}
    const merged = deepMerge(existing, patch)
    saveAppConfig(merged)
    return merged
  })

  // File-based cache with TTL
  const cacheDir = path.join(app.getPath('userData'), 'cache')

  ipcMain.handle('cache:load', (_event, namespace: string, key: string, maxAgeMs?: number) => {
    try {
      const filePath = path.join(cacheDir, namespace, `${key}.json`)
      if (!fs.existsSync(filePath)) return null
      if (maxAgeMs != null) {
        const stat = fs.statSync(filePath)
        if (Date.now() - stat.mtimeMs > maxAgeMs) return null
      }
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      return null
    }
  })

  ipcMain.handle('cache:save', (_event, namespace: string, key: string, data: any) => {
    try {
      const dir = path.join(cacheDir, namespace)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(data), 'utf-8')
    } catch {}
  })

  ipcMain.handle('cache:invalidate', (_event, namespace: string, key: string) => {
    try {
      const filePath = path.join(cacheDir, namespace, `${key}.json`)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {}
  })

  ipcMain.handle('git:branch', (_event, dirPath: string) => {
    return new Promise<string | null>((resolve) => {
      execFile('git', ['-C', dirPath, 'branch', '--show-current'], (err, stdout) => {
        resolve(err ? null : stdout.trim() || null)
      })
    })
  })

  ipcMain.handle('git:status', (_event, dirPath: string) => {
    return new Promise<Array<{ path: string; status: string }>>((resolve) => {
      execFile('git', ['-C', dirPath, 'status', '--porcelain', '-u'], { maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) { resolve([]); return }
        const entries = stdout.split('\n').filter(Boolean).map(line => {
          const xy = line.substring(0, 2)
          const filePath = line.substring(3)
          let status = 'modified'
          if (xy === '??' || xy === 'A ' || xy === 'AM') status = 'untracked'
          else if (xy.includes('D')) status = 'deleted'
          else if (xy.includes('M') || xy.includes('R') || xy.includes('C')) status = 'modified'
          return { path: filePath, status }
        })
        resolve(entries)
      })
    })
  })

  ipcMain.handle('git:shortstat', (_event, dirPath: string) => {
    return new Promise<{ insertions: number; deletions: number }>((resolve) => {
      execFile('git', ['-C', dirPath, 'diff', '--shortstat'], (err, stdout) => {
        if (err) { resolve({ insertions: 0, deletions: 0 }); return }
        const ins = stdout.match(/(\d+) insertion/)
        const del = stdout.match(/(\d+) deletion/)
        resolve({ insertions: ins ? parseInt(ins[1]) : 0, deletions: del ? parseInt(del[1]) : 0 })
      })
    })
  })

  ipcMain.handle('git:log', (_event, dirPath: string, maxCount = 200) => {
    const SEP = '\x1f' // unit separator between fields
    const REC = '\x1e' // record separator between commits
    const format = ['%H', '%h', '%P', '%an', '%ae', '%aI', '%s', '%D', '%b'].join(SEP) + REC
    return new Promise<Array<{
      hash: string; abbrev: string; parents: string[]; author: string;
      email: string; date: string; subject: string; refs: string[]; body: string
    }>>((resolve) => {
      execFile('git', ['-C', dirPath, 'log', `--format=${format}`, `--max-count=${maxCount}`],
        { maxBuffer: 1024 * 1024 * 4 },
        (err, stdout) => {
          if (err) { resolve([]); return }
          const commits = stdout.split(REC).filter(r => r.trim()).map(record => {
            const [hash, abbrev, parents, author, email, date, subject, refs, body] = record.trim().split(SEP)
            return {
              hash, abbrev,
              parents: parents ? parents.split(' ') : [],
              author, email, date, subject,
              refs: refs ? refs.split(', ').map(r => r.trim()).filter(Boolean) : [],
              body: (body ?? '').trim()
            }
          })
          resolve(commits)
        })
    })
  })

  ipcMain.handle('git:remoteUrl', (_event, dirPath: string) => {
    return new Promise<string | null>((resolve) => {
      execFile('git', ['-C', dirPath, 'remote', 'get-url', 'origin'], (err, stdout) => {
        if (err) { resolve(null); return }
        let url = stdout.trim()
        // Convert SSH to HTTPS
        const sshMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
        if (sshMatch) url = `https://${sshMatch[1]}/${sshMatch[2]}`
        // Strip trailing .git
        url = url.replace(/\.git$/, '')
        resolve(url)
      })
    })
  })

  ipcMain.handle('git:show', (_event, dirPath: string, hash: string) => {
    return new Promise<{ body: string; files: Array<{ status: string; file: string }> }>((resolve) => {
      // Get full commit body
      execFile('git', ['-C', dirPath, 'log', '-1', '--format=%B', hash], (err, bodyOut) => {
        if (err) { resolve({ body: '', files: [] }); return }
        // Get changed files
        execFile('git', ['-C', dirPath, 'diff-tree', '--root', '--no-commit-id', '-r', '--name-status', hash], (err2, filesOut) => {
          if (err2) { resolve({ body: bodyOut.trim(), files: [] }); return }
          const files = filesOut.trim().split('\n').filter(Boolean).map(line => {
            const [status, ...rest] = line.split('\t')
            return { status, file: rest.join('\t') }
          })
          resolve({ body: bodyOut.trim(), files })
        })
      })
    })
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
    return worktreeAdd(repoPath, branchName, basePath)
  })

  ipcMain.handle('git:repoRoot', (_event, dirPath: string) => {
    return new Promise<string | null>((resolve) => {
      execFile('git', ['-C', dirPath, 'rev-parse', '--show-toplevel'], (err, stdout) => {
        resolve(err ? null : stdout.trim() || null)
      })
    })
  })

  ipcMain.handle('git:branchList', (_event, repoPath: string) => {
    return new Promise<Array<{ name: string; isRemote: boolean }>>((resolve) => {
      execFile('git', ['-C', repoPath, 'branch', '-a', '--format=%(refname:short)'], (err, stdout) => {
        if (err) { resolve([]); return }
        const branches = stdout.trim().split('\n').filter(Boolean).map(name => ({
          name,
          isRemote: name.startsWith('origin/')
        }))
        resolve(branches)
      })
    })
  })

  ipcMain.handle('git:lsTree', (_event, repoPath: string, ref: string, treePath: string) => {
    return new Promise<Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }>>((resolve) => {
      const target = treePath ? `${ref}:${treePath}` : ref
      execFile('git', ['-C', repoPath, 'ls-tree', target], (err, stdout) => {
        if (err) { resolve([]); return }
        const entries = stdout.trim().split('\n').filter(Boolean).map(line => {
          const [meta, fullPath] = line.split('\t')
          const type = meta.split(' ')[1] // "blob" or "tree"
          const name = fullPath.split('/').pop() || fullPath
          const entryPath = treePath ? `${treePath}/${name}` : name
          return { name, path: entryPath, isDirectory: type === 'tree', isFile: type === 'blob' }
        })
        entries.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
        resolve(entries)
      })
    })
  })

  ipcMain.handle('git:showFile', (_event, repoPath: string, ref: string, filePath: string) => {
    return new Promise<{ success: boolean; content?: string; error?: string }>((resolve) => {
      execFile('git', ['-C', repoPath, 'show', `${ref}:${filePath}`],
        { maxBuffer: 1024 * 1024 * 4 },
        (err, stdout) => {
          if (err) resolve({ success: false, error: err.message })
          else resolve({ success: true, content: stdout })
        })
    })
  })

  // Skills
  const skillsDir = path.join(os.homedir(), '.claude', 'skills')

  ipcMain.handle('skill:exists', (_event, name: string) => {
    const skillFile = path.join(skillsDir, name, 'SKILL.md')
    return fs.existsSync(skillFile)
  })

  ipcMain.handle('skill:install', async (_event, name: string, content: string) => {
    const skillDir = path.join(skillsDir, name)
    await fs.promises.mkdir(skillDir, { recursive: true })
    await fs.promises.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8')
    return { success: true }
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
      const sessionEnvDir = path.join(home, '.claude', 'sessions')

      if (!fs.existsSync(sessionEnvDir)) return []

      const entries = await fs.promises.readdir(sessionEnvDir, { withFileTypes: true })
      const jsonFiles = entries.filter(e => e.isFile() && e.name.endsWith('.json'))

      const sessions: Array<{ id: string; mtime: number; summary: string }> = []

      for (const file of jsonFiles) {
        try {
          const raw = await fs.promises.readFile(path.join(sessionEnvDir, file.name), 'utf-8')
          const env = JSON.parse(raw) as { sessionId?: string; cwd?: string; startedAt?: number }
          if (!env.sessionId || env.cwd !== projectPath) continue

          // Try to read summary from the project's .jsonl file
          const projectKey = projectPath.replace(/[/.]/g, '-')
          const jsonlPath = path.join(home, '.claude', 'projects', projectKey, `${env.sessionId}.jsonl`)
          let summary = ''
          try {
            const fd = await fs.promises.open(jsonlPath, 'r')
            const buf = Buffer.alloc(8192)
            await fd.read(buf, 0, 8192, 0)
            await fd.close()
            for (const line of buf.toString('utf-8').split('\n')) {
              if (!line.trim()) continue
              try {
                const obj = JSON.parse(line)
                if (obj.type === 'user' && obj.message) {
                  const content = typeof obj.message === 'string'
                    ? obj.message
                    : typeof obj.message.content === 'string'
                      ? obj.message.content
                      : ''
                  const cleaned = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                  if (cleaned.length > 3 && !cleaned.startsWith('clear')) {
                    summary = cleaned.slice(0, 120)
                    break
                  }
                }
              } catch { /* skip */ }
            }
          } catch { /* no jsonl yet */ }

          sessions.push({ id: env.sessionId, mtime: env.startedAt ?? 0, summary: summary || env.sessionId.slice(0, 8) })
        } catch { /* skip unreadable files */ }
      }

      sessions.sort((a, b) => b.mtime - a.mtime)
      return sessions
    } catch {
      return []
    }
  })

  // Claude session metrics (context %, token speeds, model)
  ipcMain.handle('claude:getSessionMetrics', async (_event, sessionId: string, projectPath: string) => {
    try {
      const jsonlPath = getJsonlPath(sessionId, projectPath)
      if (!fs.existsSync(jsonlPath)) return null
      const content = await readJsonlTail(jsonlPath)
      return computeSessionMetrics(content)
    } catch {
      return null
    }
  })

  // Ticket bindings (claude sessions, worktrees, branches, PRs)
  const ticketBindingsPath = path.join(app.getPath('userData'), 'ticket-bindings.json')

  function loadTicketBindings(): Record<string, any> {
    try {
      if (fs.existsSync(ticketBindingsPath)) {
        return JSON.parse(fs.readFileSync(ticketBindingsPath, 'utf-8'))
      }
    } catch {}
    return {}
  }

  function saveTicketBindings(bindings: Record<string, any>): void {
    fs.writeFileSync(ticketBindingsPath, JSON.stringify(bindings, null, 2), 'utf-8')
  }

  ipcMain.handle('tickets:getBinding', (_event, ticketKey: string) => {
    const bindings = loadTicketBindings()
    return bindings[ticketKey] || null
  })

  ipcMain.handle('tickets:setBinding', (_event, ticketKey: string, data: any) => {
    const bindings = loadTicketBindings()
    bindings[ticketKey] = { ...bindings[ticketKey], ...data }
    saveTicketBindings(bindings)
  })

  ipcMain.handle('tickets:getAllBindings', () => {
    return loadTicketBindings()
  })

  ipcMain.handle('tickets:removeBinding', (_event, ticketKey: string) => {
    const bindings = loadTicketBindings()
    delete bindings[ticketKey]
    saveTicketBindings(bindings)
  })

  // Work sessions (lifecycle-aware replacement for ticket bindings)
  const workSessionsPath = path.join(app.getPath('userData'), 'work-sessions.json')

  function loadWorkSessions(): { version: 1; sessions: any[] } {
    try {
      if (fs.existsSync(workSessionsPath)) {
        return JSON.parse(fs.readFileSync(workSessionsPath, 'utf-8'))
      }
    } catch {}
    // Auto-migrate from ticket-bindings.json if it exists
    if (fs.existsSync(ticketBindingsPath)) {
      try {
        const bindings = JSON.parse(fs.readFileSync(ticketBindingsPath, 'utf-8'))
        const sessions = Object.entries(bindings).map(([ticketKey, data]: [string, any]) => ({
          id: `migrated-${ticketKey}`,
          projectPath: '',
          ticketKey,
          jiraConnectionId: '',
          worktree: data.worktree_path ? {
            path: data.worktree_path,
            branch: data.branch_name || '',
            baseBranch: 'main',
          } : null,
          sessionId: null,
          claudeSessionId: data.claude_session_id || null,
          prUrl: data.pr_url || null,
          status: 'active' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))
        const file = { version: 1 as const, sessions }
        fs.writeFileSync(workSessionsPath, JSON.stringify(file, null, 2), 'utf-8')
        fs.renameSync(ticketBindingsPath, ticketBindingsPath + '.bak')
        return file
      } catch {}
    }
    return { version: 1, sessions: [] }
  }

  function saveWorkSessions(file: { version: 1; sessions: any[] }): void {
    fs.writeFileSync(workSessionsPath, JSON.stringify(file, null, 2), 'utf-8')
  }

  ipcMain.handle('sessions:create', (_event, session: any) => {
    const file = loadWorkSessions()
    file.sessions.push(session)
    saveWorkSessions(file)
    return session
  })

  ipcMain.handle('sessions:update', (_event, id: string, patch: any) => {
    const file = loadWorkSessions()
    const idx = file.sessions.findIndex((s: any) => s.id === id)
    if (idx === -1) return null
    file.sessions[idx] = { ...file.sessions[idx], ...patch, updatedAt: new Date().toISOString() }
    saveWorkSessions(file)
    return file.sessions[idx]
  })

  ipcMain.handle('sessions:get', (_event, id: string) => {
    const file = loadWorkSessions()
    return file.sessions.find((s: any) => s.id === id) || null
  })

  ipcMain.handle('sessions:getByTicket', (_event, ticketKey: string) => {
    const file = loadWorkSessions()
    return file.sessions.filter((s: any) => s.ticketKey === ticketKey)
  })

  ipcMain.handle('sessions:getAll', (_event, filter?: { status?: string; projectPath?: string }) => {
    const file = loadWorkSessions()
    let sessions = file.sessions
    if (filter?.status) sessions = sessions.filter((s: any) => s.status === filter.status)
    if (filter?.projectPath) sessions = sessions.filter((s: any) => s.projectPath === filter.projectPath)
    return sessions
  })

  ipcMain.handle('sessions:delete', (_event, id: string) => {
    const file = loadWorkSessions()
    file.sessions = file.sessions.filter((s: any) => s.id !== id)
    saveWorkSessions(file)
  })

  // Claude CLI ticket generation (via conductord)
  ipcMain.handle('claude:generateTicket', async (_event, description: string, projectKey: string, epicSummary?: string) => {
    const epicContext = epicSummary ? ` under the epic "${epicSummary}"` : ''
    const prompt = `You are generating a Jira ticket for project ${projectKey}${epicContext}.

The user described what they need:
"${description}"

Generate a properly formatted Jira ticket. Respond with ONLY valid JSON, no markdown, no code fences:
{"summary": "concise ticket title", "description": "detailed description with acceptance criteria", "issueType": "Task|Bug|Story"}`

    try {
      const { body: result } = await conductordFetch('/api/exec', {
        method: 'POST',
        body: JSON.stringify({
          command: 'claude',
          args: ['-p', prompt, '--output-format', 'text'],
          timeout: 60,
        }),
      }) as { body: { success: boolean; stdout?: string; stderr?: string; error?: string } }

      if (!result.success) {
        return { success: false, error: result.error || result.stderr || 'Command failed' }
      }

      const raw = (result.stdout || '').trim()
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return { success: false, error: 'No JSON found in Claude response' }
      }

      const parsed = JSON.parse(jsonMatch[0])
      return {
        success: true,
        summary: parsed.summary,
        description: parsed.description,
        issueType: parsed.issueType || 'Task',
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to reach conductord' }
    }
  })

  // HTTP proxy (avoids CORS in renderer)
  ipcMain.handle('http:fetch', async (_event, url: string, headers: Record<string, string>) => {
    try {
      const res = await fetch(url, { headers })
      const contentType = res.headers.get('content-type') || ''
      const body = contentType.includes('json') ? await res.json() : null
      return { ok: res.ok, status: res.status, body }
    } catch (err) {
      return { ok: false, status: 0, body: null, error: String(err) }
    }
  })

  ipcMain.handle('http:post', async (_event, url: string, headers: Record<string, string>, body: string) => {
    try {
      const res = await fetch(url, { method: 'POST', headers, body })
      const contentType = res.headers.get('content-type') || ''
      const resBody = contentType.includes('json') ? await res.json() : null
      return { ok: res.ok, status: res.status, body: resBody }
    } catch (err) {
      return { ok: false, status: 0, body: null, error: String(err) }
    }
  })

  ipcMain.handle('http:put', async (_event, url: string, headers: Record<string, string>, body: string) => {
    try {
      const res = await fetch(url, { method: 'PUT', headers, body })
      const contentType = res.headers.get('content-type') || ''
      const resBody = contentType.includes('json') ? await res.json() : null
      return { ok: res.ok, status: res.status, body: resBody }
    } catch (err) {
      return { ok: false, status: 0, body: null, error: String(err) }
    }
  })

  ipcMain.handle('http:delete', async (_event, url: string, headers: Record<string, string>) => {
    try {
      const res = await fetch(url, { method: 'DELETE', headers })
      const contentType = res.headers.get('content-type') || ''
      const resBody = contentType.includes('json') ? await res.json() : null
      return { ok: res.ok, status: res.status, body: resBody }
    } catch (err) {
      return { ok: false, status: 0, body: null, error: String(err) }
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
      .filter(d => {
        if (d.isDirectory()) return true
        if (d.isSymbolicLink()) {
          try { return fs.statSync(path.join(extensionsDir, d.name)).isDirectory() } catch { return false }
        }
        return false
      })
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

  // Watch for .zip files dropped into the extensions directory and auto-install
  if (!fs.existsSync(extensionsDir)) {
    fs.mkdirSync(extensionsDir, { recursive: true })
  }
  const processingZips = new Set<string>()
  fs.watch(extensionsDir, async (eventType, filename) => {
    if (!filename || !filename.endsWith('.zip')) return
    const zipPath = path.join(extensionsDir, filename)
    if (processingZips.has(zipPath)) return
    processingZips.add(zipPath)

    try {
      // Brief delay to let the file finish writing
      await new Promise(r => setTimeout(r, 500))
      if (!fs.existsSync(zipPath)) return

      const AdmZip = await import('adm-zip')
      const zip = new AdmZip.default(zipPath)
      const manifestEntry = zip.getEntry('manifest.json')
      if (!manifestEntry) {
        console.warn(`[extensions] ${filename} has no manifest.json, skipping`)
        return
      }

      const manifest = JSON.parse(manifestEntry.getData().toString('utf-8'))
      if (!manifest.id) {
        console.warn(`[extensions] ${filename} manifest missing id, skipping`)
        return
      }

      const destDir = path.join(extensionsDir, manifest.id)
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true })
      }
      zip.extractAllTo(destDir, true)

      // Remove the zip after successful extraction
      fs.unlinkSync(zipPath)
      console.log(`[extensions] Auto-installed ${manifest.id} from ${filename}`)

      // Notify all renderer windows so they can reload extensions
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('extensions:installed', manifest.id)
      }
    } catch (err) {
      console.error(`[extensions] Failed to auto-install ${filename}:`, err)
    } finally {
      processingZips.delete(zipPath)
    }
  })

  ipcMain.handle('extensions:uninstall', async (_event, extensionId: string) => {
    const extDir = path.join(extensionsDir, extensionId)
    if (fs.existsSync(extDir)) {
      await fs.promises.rm(extDir, { recursive: true, force: true })
      const extCacheDir = path.join(cacheDir, extensionId)
      if (fs.existsSync(extCacheDir)) {
        await fs.promises.rm(extCacheDir, { recursive: true, force: true })
      }
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

  ipcMain.handle('extensions:selectDir', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Load Unpacked Extension',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('extensions:installUnpacked', async (_event, dirPath: string) => {
    const manifestPath = path.join(dirPath, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      return { success: false, error: 'No manifest.json found in directory' }
    }

    let manifest: any
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    } catch {
      return { success: false, error: 'Failed to parse manifest.json' }
    }

    if (!manifest.id) {
      return { success: false, error: 'manifest.json missing id field' }
    }

    // Return the original path so the renderer can store it in config and load
    // directly from the source directory (no symlink needed).
    return { success: true, extensionId: manifest.id, dirPath }
  })

  // Conductord log watching
  ipcMain.handle('conductord:watchLogs', (event) => {
    const watchId = `log-${++logWatchCounter}`
    const logPath = path.join(os.homedir(), 'Library', 'Logs', 'conductord.log')
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return watchId

    // Read existing content first
    let offset = 0
    try {
      const stat = fs.statSync(logPath)
      // Read last 64KB of existing log
      const readStart = Math.max(0, stat.size - 65536)
      const fd = fs.openSync(logPath, 'r')
      const buf = Buffer.alloc(stat.size - readStart)
      fs.readSync(fd, buf, 0, buf.length, readStart)
      fs.closeSync(fd)
      offset = stat.size
      const content = buf.toString('utf-8')
      if (content.length > 0) {
        win.webContents.send('conductord:logs', watchId, content)
      }
    } catch {
      // File may not exist yet
    }

    // Watch for changes
    const sendNewData = () => {
      try {
        const stat = fs.statSync(logPath)
        if (stat.size <= offset) {
          if (stat.size < offset) offset = 0 // File was truncated/rotated
          return
        }
        const fd = fs.openSync(logPath, 'r')
        const buf = Buffer.alloc(stat.size - offset)
        fs.readSync(fd, buf, 0, buf.length, offset)
        fs.closeSync(fd)
        offset = stat.size
        const content = buf.toString('utf-8')
        if (content.length > 0 && !win.isDestroyed()) {
          win.webContents.send('conductord:logs', watchId, content)
        }
      } catch {
        // Ignore read errors
      }
    }

    try {
      const watcher = fs.watch(logPath, () => sendNewData())
      logWatchers.set(watchId, { watcher, offset, logPath })
    } catch {
      // If file doesn't exist yet, poll for it
      const interval = setInterval(() => {
        if (fs.existsSync(logPath)) {
          clearInterval(interval)
          try {
            const watcher = fs.watch(logPath, () => sendNewData())
            logWatchers.set(watchId, { watcher, offset, logPath })
          } catch { /* ignore */ }
        }
      }, 2000)
      // Store interval so we can clean up
      const cleanup = { watcher: { close: () => clearInterval(interval) } as unknown as fs.FSWatcher, offset, logPath }
      logWatchers.set(watchId, cleanup)
    }

    return watchId
  })

  ipcMain.handle('conductord:unwatchLogs', (_event, watchId: string) => {
    const entry = logWatchers.get(watchId)
    if (entry) {
      entry.watcher.close()
      logWatchers.delete(watchId)
    }
  })


  // Renderer -> main process log forwarding
  ipcMain.on('log:debug', (_event, msg: string) => {
    debugLog(msg)
  })

  // Conductord REST proxy (renderer can't reach Unix socket directly)
  ipcMain.handle('conductord:health', async () => {
    try {
      const { status } = await conductordFetch('/health')
      return status === 200
    } catch {
      return false
    }
  })

  ipcMain.handle('conductord:getSessions', async () => {
    try {
      const { body } = await conductordFetch('/api/sessions')
      return body
    } catch {
      return []
    }
  })

  ipcMain.handle('conductord:getTmuxSessions', async () => {
    try {
      const { body } = await conductordFetch('/api/sessions')
      return body
    } catch {
      return []
    }
  })

  ipcMain.handle('conductord:killTmuxSession', async (_event, name: string) => {
    try {
      await conductordFetch(`/api/sessions/${encodeURIComponent(name)}`, { method: 'DELETE' })
      return true
    } catch {
      return false
    }
  })

  // Shell
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try {
      await shell.openExternal(url)
    } catch (err) {
      console.error('[ipc] Failed to open external URL:', url, err)
    }
  })

  ipcMain.handle('shell:showItemInFolder', (_event, fullPath: string) => {
    shell.showItemInFolder(fullPath)
  })

  // Webview GPU throttling — reduce compositing when browser tab is hidden
  ipcMain.handle('webview:suspend', (_event, webContentsId: number) => {
    const wc = webContents.fromId(webContentsId)
    if (!wc) return
    wc.setBackgroundThrottling(true)
    wc.setFrameRate(1)
  })

  ipcMain.handle('webview:resume', (_event, webContentsId: number) => {
    const wc = webContents.fromId(webContentsId)
    if (!wc) return
    wc.setBackgroundThrottling(false)
    wc.setFrameRate(60)
  })

  // Terminal WebSocket bridge (renderer <-> conductord via Unix socket)
  registerTerminalBridge()
}
