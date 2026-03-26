/// <reference types="vite/client" />

import type { IpcRendererEvent } from 'electron'

interface TicketBinding {
  claude_session_id: string | null
  iterm_session_id: string | null
  claude_active: boolean
  auto_pilot: boolean
  worktree_path: string | null
  branch_name: string | null
  pr_url: string | null
}

interface ElectronAPI {
  // Window controls
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  forceClose: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onCloseRequested: (callback: () => void) => void
  offCloseRequested: (callback: () => void) => void

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
  getTicketBinding: (ticketKey: string) => Promise<TicketBinding | null>
  setTicketBinding: (ticketKey: string, data: Partial<TicketBinding>) => Promise<void>
  getAllTicketBindings: () => Promise<Record<string, TicketBinding>>
  removeTicketBinding: (ticketKey: string) => Promise<void>

  // Projects
  selectDirectory: () => Promise<string | null>
  saveProjectDialog: () => Promise<string | null>
  openProjectDialog: () => Promise<string | null>
  loadRecentProjects: () => Promise<Array<{ name: string; path: string }>>
  saveRecentProjects: (projects: Array<{ name: string; path: string }>) => Promise<void>

  // Claude
  generateTicket: (description: string, projectKey: string, epicSummary?: string) =>
    Promise<{ success: boolean; summary?: string; description?: string; issueType?: string; error?: string }>

  // Jira
  jiraFetch: (url: string, headers: Record<string, string>) => Promise<{ ok: boolean; status: number; body: unknown; error?: string }>
  jiraPost: (url: string, headers: Record<string, string>, body: string) => Promise<{ ok: boolean; status: number; body: unknown; error?: string }>

  // Extensions
  getExtensionsDir: () => Promise<string>
  listExtensions: () => Promise<Array<{ id: string; name: string; version: string; description?: string }>>
  installExtension: (zipPath: string) => Promise<{ success: boolean; extensionId?: string; error?: string }>
  uninstallExtension: (extensionId: string) => Promise<{ success: boolean; error?: string }>
  selectExtensionZip: () => Promise<string | null>

  // Conductord log watching
  watchConductordLogs: () => Promise<string>
  unwatchConductordLogs: (watchId: string) => Promise<void>
  onConductordLogs: (callback: (event: IpcRendererEvent, watchId: string, data: string) => void) => void
  offConductordLogs: (callback: (event: IpcRendererEvent, watchId: string, data: string) => void) => void

  // Service management
  isConductordInstalled: () => Promise<boolean>
  installConductord: () => Promise<{ success: boolean; error?: string }>
  uninstallConductord: () => Promise<{ success: boolean; error?: string }>
  startConductord: () => Promise<{ success: boolean; error?: string }>
  stopConductord: () => Promise<{ success: boolean; error?: string }>
  restartConductord: () => Promise<{ success: boolean; error?: string }>

  // Platform
  platform: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
