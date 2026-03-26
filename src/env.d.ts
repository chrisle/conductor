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

  // Git
  worktreeList: (repoPath: string) => Promise<Array<{ path: string; branch: string; bare: boolean; head: string }>>
  worktreeAdd: (repoPath: string, branchName: string, basePath?: string) => Promise<{ success: boolean; path?: string; error?: string }>

  // Claude
  getCwd: () => Promise<string>
  listClaudeSessions: (projectPath: string) => Promise<Array<{ id: string; mtime: number; summary: string }>>

  // Projects
  selectDirectory: () => Promise<string | null>
  saveProjectDialog: () => Promise<string | null>
  openProjectDialog: () => Promise<string | null>
  loadRecentProjects: () => Promise<Array<{ name: string; path: string }>>
  saveRecentProjects: (projects: Array<{ name: string; path: string }>) => Promise<void>

  // Extensions
  getExtensionsDir: () => Promise<string>
  listExtensions: () => Promise<Array<{ id: string; name: string; version: string; description?: string }>>
  installExtension: (zipPath: string) => Promise<{ success: boolean; extensionId?: string; error?: string }>
  uninstallExtension: (extensionId: string) => Promise<{ success: boolean; error?: string }>
  selectExtensionZip: () => Promise<string | null>

  // Platform
  platform: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
