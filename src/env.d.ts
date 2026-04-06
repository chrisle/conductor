/// <reference types="vite/client" />

import type { IpcRendererEvent } from 'electron'
import type { AppConfig, DeepPartial } from './types/app-config'
import type { WorkSession } from './types/work-session'

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
  openNewWindow: () => Promise<void>
  onCloseRequested: (callback: () => void) => void
  offCloseRequested: (callback: () => void) => void
  onCloseTabRequested: (callback: () => void) => void
  offCloseTabRequested: (callback: () => void) => void

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
  gitLog: (path: string, maxCount?: number) => Promise<Array<{
    hash: string; abbrev: string; parents: string[]; author: string;
    email: string; date: string; subject: string; refs: string[]; body: string
  }>>
  gitShow: (path: string, hash: string) => Promise<{ body: string; files: Array<{ status: string; file: string }> }>
  gitRemoteUrl: (path: string) => Promise<string | null>
  gitShortstat: (path: string) => Promise<{ insertions: number; deletions: number }>

  // App config
  loadConfig: () => Promise<AppConfig | null>
  saveConfig: (config: AppConfig) => Promise<void>
  patchConfig: (patch: DeepPartial<AppConfig>) => Promise<AppConfig>

  // Cache
  loadCache: (namespace: string, key: string, maxAgeMs?: number) => Promise<any>
  saveCache: (namespace: string, key: string, data: any) => Promise<void>
  invalidateCache: (namespace: string, key: string) => Promise<void>

  // Terminal (bridged to conductord Unix socket via main process)
  createTerminal: (id: string, cwd?: string, command?: string) => Promise<{ isNew: boolean }>
  writeTerminal: (id: string, data: string) => Promise<void>
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>
  killTerminal: (id: string) => Promise<void>
  setAutoPilot: (id: string, enabled: boolean) => Promise<void>
  captureScrollback: (id: string) => Promise<string | null>
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
  getSessionMetrics: (sessionId: string, projectPath: string) => Promise<{
    contextPercent: number | null
    inputSpeed: number | null
    outputSpeed: number | null
    model: string | null
  } | null>
  getTicketBinding: (ticketKey: string) => Promise<TicketBinding | null>
  setTicketBinding: (ticketKey: string, data: Partial<TicketBinding>) => Promise<void>
  getAllTicketBindings: () => Promise<Record<string, TicketBinding>>
  removeTicketBinding: (ticketKey: string) => Promise<void>

  // Work sessions
  createWorkSession: (session: WorkSession) => Promise<WorkSession>
  updateWorkSession: (id: string, patch: Partial<WorkSession>) => Promise<WorkSession | null>
  getWorkSession: (id: string) => Promise<WorkSession | null>
  getWorkSessionsByTicket: (ticketKey: string) => Promise<WorkSession[]>
  getAllWorkSessions: (filter?: { status?: string; projectPath?: string }) => Promise<WorkSession[]>
  deleteWorkSession: (id: string) => Promise<void>

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
  jiraPut: (url: string, headers: Record<string, string>, body: string) => Promise<{ ok: boolean; status: number; body: unknown; error?: string }>

  // Extensions
  getExtensionsDir: () => Promise<string>
  listExtensions: () => Promise<Array<{ id: string; name: string; version: string; description?: string }>>
  installExtension: (zipPath: string) => Promise<{ success: boolean; extensionId?: string; error?: string }>
  uninstallExtension: (extensionId: string) => Promise<{ success: boolean; error?: string }>
  selectExtensionZip: () => Promise<string | null>
  selectExtensionDir: () => Promise<string | null>
  installUnpackedExtension: (dirPath: string) => Promise<{ success: boolean; extensionId?: string; error?: string }>
  onExtensionInstalled: (cb: (extensionId: string) => void) => () => void

  // Conductord log watching
  watchConductordLogs: () => Promise<string>
  unwatchConductordLogs: (watchId: string) => Promise<void>
  onConductordLogs: (callback: (event: IpcRendererEvent, watchId: string, data: string) => void) => void
  offConductordLogs: (callback: (event: IpcRendererEvent, watchId: string, data: string) => void) => void


  // Conductord REST proxy
  conductordHealth: () => Promise<boolean>
  conductordGetSessions: () => Promise<Array<{ id: string; dead: boolean; cwd: string; command: string }>>

  // Debug logging
  logDebug: (msg: string) => void

  // Shell
  openExternal: (url: string) => Promise<void>

  // Platform
  platform: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
