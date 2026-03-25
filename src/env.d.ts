/// <reference types="vite/client" />

import type { IpcRendererEvent } from 'electron'

interface ElectronAPI {
  // Window controls
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>

  // File system
  readDir: (path: string) => Promise<Array<{
    name: string
    path: string
    isDirectory: boolean
    isFile: boolean
  }>>
  readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>
  readFileBinary: (path: string) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }>
  writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
  rename: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
  deleteFile: (path: string) => Promise<{ success: boolean; error?: string }>
  mkdir: (path: string) => Promise<{ success: boolean; error?: string }>
  getHomeDir: () => Promise<string>
  autocomplete: (partial: string) => Promise<string[]>
  loadFavorites: () => Promise<string[]>
  saveFavorites: (favorites: string[]) => Promise<void>
  gitBranch: (path: string) => Promise<string | null>

  // Terminal
  createTerminal: (id: string, cwd?: string) => Promise<void>
  writeTerminal: (id: string, data: string) => Promise<void>
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>
  killTerminal: (id: string) => Promise<void>
  onTerminalData: (callback: (event: IpcRendererEvent, id: string, data: string) => void) => void
  offTerminalData: (callback: (event: IpcRendererEvent, id: string, data: string) => void) => void
  onTerminalExit: (callback: (event: IpcRendererEvent, id: string) => void) => void
  offTerminalExit: (callback: (event: IpcRendererEvent, id: string) => void) => void

  // Platform
  platform: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
