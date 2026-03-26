import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

const electronAPI = {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  forceClose: () => ipcRenderer.invoke('window:forceClose'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onCloseRequested: (callback: () => void) =>
    ipcRenderer.on('window:closeRequested', callback),
  offCloseRequested: (callback: () => void) =>
    ipcRenderer.removeListener('window:closeRequested', callback),

  // File system
  readDir: (path: string) => ipcRenderer.invoke('fs:readDir', path),
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  readFileBinary: (path: string) => ipcRenderer.invoke('fs:readFileBinary', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:writeFile', path, content),
  mkdir: (path: string) => ipcRenderer.invoke('fs:mkdir', path),
  gitBranch: (path: string) => ipcRenderer.invoke('git:branch', path),
  rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  deleteFile: (path: string) => ipcRenderer.invoke('fs:delete', path),
  getHomeDir: () => ipcRenderer.invoke('fs:getHomeDir'),
  autocomplete: (partial: string) => ipcRenderer.invoke('fs:autocomplete', partial),
  loadFavorites: () => ipcRenderer.invoke('favorites:load'),
  saveFavorites: (favorites: string[]) => ipcRenderer.invoke('favorites:save', favorites),

  // Terminal
  createTerminal: (id: string, cwd?: string) => ipcRenderer.invoke('terminal:create', id, cwd),
  writeTerminal: (id: string, data: string) => ipcRenderer.invoke('terminal:write', id, data),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', id, cols, rows),
  killTerminal: (id: string) => ipcRenderer.invoke('terminal:kill', id),
  onTerminalData: (callback: (event: IpcRendererEvent, id: string, data: string) => void) =>
    ipcRenderer.on('terminal:data', callback),
  offTerminalData: (callback: (event: IpcRendererEvent, id: string, data: string) => void) =>
    ipcRenderer.removeListener('terminal:data', callback),
  onTerminalExit: (callback: (event: IpcRendererEvent, id: string) => void) =>
    ipcRenderer.on('terminal:exit', callback),
  offTerminalExit: (callback: (event: IpcRendererEvent, id: string) => void) =>
    ipcRenderer.removeListener('terminal:exit', callback),

  // Git
  worktreeList: (repoPath: string) => ipcRenderer.invoke('git:worktreeList', repoPath),
  worktreeAdd: (repoPath: string, branchName: string, basePath?: string) => ipcRenderer.invoke('git:worktreeAdd', repoPath, branchName, basePath),

  // Claude
  getCwd: () => ipcRenderer.invoke('app:getCwd'),
  listClaudeSessions: (projectPath: string) => ipcRenderer.invoke('claude:listSessions', projectPath),
  getTicketBinding: (ticketKey: string) => ipcRenderer.invoke('tickets:getBinding', ticketKey),
  setTicketBinding: (ticketKey: string, data: any) => ipcRenderer.invoke('tickets:setBinding', ticketKey, data),
  getAllTicketBindings: () => ipcRenderer.invoke('tickets:getAllBindings'),
  removeTicketBinding: (ticketKey: string) => ipcRenderer.invoke('tickets:removeBinding', ticketKey),

  // Projects
  selectDirectory: () => ipcRenderer.invoke('project:selectDirectory'),
  saveProjectDialog: () => ipcRenderer.invoke('project:saveDialog'),
  openProjectDialog: () => ipcRenderer.invoke('project:openDialog'),
  loadRecentProjects: () => ipcRenderer.invoke('project:loadRecent'),
  saveRecentProjects: (projects: Array<{ name: string; path: string }>) => ipcRenderer.invoke('project:saveRecent', projects),

  // Claude
  generateTicket: (description: string, projectKey: string, epicSummary?: string) =>
    ipcRenderer.invoke('claude:generateTicket', description, projectKey, epicSummary),

  // Jira
  jiraFetch: (url: string, headers: Record<string, string>) => ipcRenderer.invoke('jira:fetch', url, headers),
  jiraPost: (url: string, headers: Record<string, string>, body: string) => ipcRenderer.invoke('jira:post', url, headers, body),

  // Extensions
  getExtensionsDir: () => ipcRenderer.invoke('extensions:getDir'),
  listExtensions: () => ipcRenderer.invoke('extensions:list'),
  installExtension: (zipPath: string) => ipcRenderer.invoke('extensions:install', zipPath),
  uninstallExtension: (extensionId: string) => ipcRenderer.invoke('extensions:uninstall', extensionId),
  selectExtensionZip: () => ipcRenderer.invoke('extensions:selectZip'),

  // Conductord log watching
  watchConductordLogs: () => ipcRenderer.invoke('conductord:watchLogs'),
  unwatchConductordLogs: (watchId: string) => ipcRenderer.invoke('conductord:unwatchLogs', watchId),
  onConductordLogs: (callback: (event: IpcRendererEvent, watchId: string, data: string) => void) =>
    ipcRenderer.on('conductord:logs', callback),
  offConductordLogs: (callback: (event: IpcRendererEvent, watchId: string, data: string) => void) =>
    ipcRenderer.removeListener('conductord:logs', callback),

  // Service management
  isConductordInstalled: () => ipcRenderer.invoke('conductord:isInstalled'),
  installConductord: () => ipcRenderer.invoke('conductord:install'),
  uninstallConductord: () => ipcRenderer.invoke('conductord:uninstall'),
  startConductord: () => ipcRenderer.invoke('conductord:start'),
  stopConductord: () => ipcRenderer.invoke('conductord:stop'),
  restartConductord: () => ipcRenderer.invoke('conductord:restart'),

  // Platform
  platform: process.platform
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
