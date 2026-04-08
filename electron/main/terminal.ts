import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { isTempDir } from './platform-utils'

interface TerminalInstance {
  pty: pty.IPty
  id: string
}

const terminals = new Map<string, TerminalInstance>()
let didEnsureSpawnHelperExecutable = false

function getShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe'
  }
  return process.env.SHELL || '/bin/zsh'
}

function ensureNodePtySpawnHelperExecutable(): void {
  if (didEnsureSpawnHelperExecutable || process.platform !== 'darwin') {
    return
  }
  didEnsureSpawnHelperExecutable = true

  try {
    const nodePtyDir = path.dirname(require.resolve('node-pty/package.json'))
    const helperPath = path.join(nodePtyDir, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper')
    const stat = fs.statSync(helperPath)

    // npm installs can lose the executable bit on macOS, which makes node-pty fail
    // with "posix_spawnp failed" before any terminal output appears.
    if ((stat.mode & 0o100) === 0) {
      fs.chmodSync(helperPath, stat.mode | 0o755)
    }
  } catch (error) {
    console.warn('Failed to ensure node-pty spawn-helper is executable:', error)
  }
}


export function createTerminal(id: string, win: BrowserWindow, cwd?: string): void {
  if (terminals.has(id)) {
    return
  }

  ensureNodePtySpawnHelperExecutable()
  const shell = getShell()
  // Guard: never use a temp directory as working directory
  const safeCwd = (cwd && !isTempDir(cwd)) ? cwd : os.homedir()
  const ptyProcess = pty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: safeCwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    } as Record<string, string>
  })

  ptyProcess.onData((data) => {
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:data', id, data)
    }
  })

  ptyProcess.onExit(() => {
    terminals.delete(id)
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:exit', id)
    }
  })

  terminals.set(id, { pty: ptyProcess, id })
}

export function writeTerminal(id: string, data: string): void {
  const terminal = terminals.get(id)
  if (terminal) {
    terminal.pty.write(data)
  }
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  const terminal = terminals.get(id)
  if (terminal && cols >= 2 && rows >= 2) {
    terminal.pty.resize(cols, rows)
  }
}

export function killTerminal(id: string): void {
  const terminal = terminals.get(id)
  if (terminal) {
    terminal.pty.kill()
    terminals.delete(id)
  }
}

export function killAllTerminals(): void {
  for (const [id, terminal] of terminals) {
    terminal.pty.kill()
    terminals.delete(id)
  }
}
