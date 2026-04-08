import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

const electronAPI = {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  forceClose: () => ipcRenderer.invoke('window:forceClose'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  openNewWindow: () => ipcRenderer.invoke('window:openNew'),
  onCloseRequested: (callback: () => void) =>
    ipcRenderer.on('window:closeRequested', callback),
  offCloseRequested: (callback: () => void) =>
    ipcRenderer.removeListener('window:closeRequested', callback),
  onCloseTabRequested: (callback: () => void) =>
    ipcRenderer.on('tab:closeRequested', callback),
  offCloseTabRequested: (callback: () => void) =>
    ipcRenderer.removeListener('tab:closeRequested', callback),

  // File system
  readDir: (path: string) => ipcRenderer.invoke('fs:readDir', path),
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  readFileBinary: (path: string) => ipcRenderer.invoke('fs:readFileBinary', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:writeFile', path, content),
  mkdir: (path: string) => ipcRenderer.invoke('fs:mkdir', path),
  gitBranch: (path: string) => ipcRenderer.invoke('git:branch', path),
  gitLog: (path: string, maxCount?: number) => ipcRenderer.invoke('git:log', path, maxCount),
  gitShow: (path: string, hash: string) => ipcRenderer.invoke('git:show', path, hash),
  gitRemoteUrl: (path: string) => ipcRenderer.invoke('git:remoteUrl', path),
  gitShortstat: (path: string) => ipcRenderer.invoke('git:shortstat', path),
  rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  deleteFile: (path: string) => ipcRenderer.invoke('fs:delete', path),
  getHomeDir: () => ipcRenderer.invoke('fs:getHomeDir'),
  autocomplete: (partial: string) => ipcRenderer.invoke('fs:autocomplete', partial),
  loadFavorites: () => ipcRenderer.invoke('favorites:load'),
  saveFavorites: (favorites: string[]) => ipcRenderer.invoke('favorites:save', favorites),

  // App config
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config: any) => ipcRenderer.invoke('config:save', config),
  patchConfig: (patch: any) => ipcRenderer.invoke('config:patch', patch),

  // Cache
  loadCache: (namespace: string, key: string, maxAgeMs?: number) => ipcRenderer.invoke('cache:load', namespace, key, maxAgeMs),
  saveCache: (namespace: string, key: string, data: any) => ipcRenderer.invoke('cache:save', namespace, key, data),
  invalidateCache: (namespace: string, key: string) => ipcRenderer.invoke('cache:invalidate', namespace, key),

  // Terminal (bridged to conductord Unix socket via main process)
  createTerminal: (id: string, cwd?: string, command?: string) => ipcRenderer.invoke('terminal:create', id, cwd, command),
  writeTerminal: (id: string, data: string) => ipcRenderer.invoke('terminal:write', id, data),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', id, cols, rows),
  killTerminal: (id: string) => ipcRenderer.invoke('terminal:kill', id),
  setAutoPilot: (id: string, enabled: boolean) => ipcRenderer.invoke('terminal:setAutoPilot', id, enabled),
  captureScrollback: (id: string) => ipcRenderer.invoke('terminal:captureScrollback', id),
  onTerminalData: (callback: (event: IpcRendererEvent, id: string, data: string) => void) =>
    ipcRenderer.on('terminal:data', callback),
  offTerminalData: (callback: (event: IpcRendererEvent, id: string, data: string) => void) =>
    ipcRenderer.removeListener('terminal:data', callback),
  onTerminalExit: (callback: (event: IpcRendererEvent, id: string) => void) =>
    ipcRenderer.on('terminal:exit', callback),
  offTerminalExit: (callback: (event: IpcRendererEvent, id: string) => void) =>
    ipcRenderer.removeListener('terminal:exit', callback),
  onAutopilotMatch: (callback: (event: IpcRendererEvent, id: string, response: string) => void) =>
    ipcRenderer.on('terminal:autopilot_match', callback),
  offAutopilotMatch: (callback: (event: IpcRendererEvent, id: string, response: string) => void) =>
    ipcRenderer.removeListener('terminal:autopilot_match', callback),

  // Git
  worktreeList: (repoPath: string) => ipcRenderer.invoke('git:worktreeList', repoPath),
  worktreeAdd: (repoPath: string, branchName: string, basePath?: string) => ipcRenderer.invoke('git:worktreeAdd', repoPath, branchName, basePath),

  // Skills
  skillExists: (name: string) => ipcRenderer.invoke('skill:exists', name),
  installSkill: (name: string, content: string) => ipcRenderer.invoke('skill:install', name, content),

  // Claude
  getCwd: () => ipcRenderer.invoke('app:getCwd'),
  listClaudeSessions: (projectPath: string) => ipcRenderer.invoke('claude:listSessions', projectPath),
  getSessionMetrics: (sessionId: string, projectPath: string) => ipcRenderer.invoke('claude:getSessionMetrics', sessionId, projectPath),
  getTicketBinding: (ticketKey: string) => ipcRenderer.invoke('tickets:getBinding', ticketKey),
  setTicketBinding: (ticketKey: string, data: any) => ipcRenderer.invoke('tickets:setBinding', ticketKey, data),
  getAllTicketBindings: () => ipcRenderer.invoke('tickets:getAllBindings'),
  removeTicketBinding: (ticketKey: string) => ipcRenderer.invoke('tickets:removeBinding', ticketKey),

  // Work sessions
  createWorkSession: (session: any) => ipcRenderer.invoke('sessions:create', session),
  updateWorkSession: (id: string, patch: any) => ipcRenderer.invoke('sessions:update', id, patch),
  getWorkSession: (id: string) => ipcRenderer.invoke('sessions:get', id),
  getWorkSessionsByTicket: (ticketKey: string) => ipcRenderer.invoke('sessions:getByTicket', ticketKey),
  getAllWorkSessions: (filter?: { status?: string; projectPath?: string }) => ipcRenderer.invoke('sessions:getAll', filter),
  deleteWorkSession: (id: string) => ipcRenderer.invoke('sessions:delete', id),

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
  jiraPut: (url: string, headers: Record<string, string>, body: string) => ipcRenderer.invoke('jira:put', url, headers, body),

  // Extensions
  getExtensionsDir: () => ipcRenderer.invoke('extensions:getDir'),
  listExtensions: () => ipcRenderer.invoke('extensions:list'),
  installExtension: (zipPath: string) => ipcRenderer.invoke('extensions:install', zipPath),
  uninstallExtension: (extensionId: string) => ipcRenderer.invoke('extensions:uninstall', extensionId),
  selectExtensionZip: () => ipcRenderer.invoke('extensions:selectZip'),
  selectExtensionDir: () => ipcRenderer.invoke('extensions:selectDir'),
  installUnpackedExtension: (dirPath: string) => ipcRenderer.invoke('extensions:installUnpacked', dirPath),
  onExtensionInstalled: (cb: (extensionId: string) => void) => {
    const handler = (_event: any, id: string) => cb(id)
    ipcRenderer.on('extensions:installed', handler)
    return () => ipcRenderer.removeListener('extensions:installed', handler)
  },

  // Conductord log watching
  watchConductordLogs: () => ipcRenderer.invoke('conductord:watchLogs'),
  unwatchConductordLogs: (watchId: string) => ipcRenderer.invoke('conductord:unwatchLogs', watchId),
  onConductordLogs: (callback: (event: IpcRendererEvent, watchId: string, data: string) => void) =>
    ipcRenderer.on('conductord:logs', callback),
  offConductordLogs: (callback: (event: IpcRendererEvent, watchId: string, data: string) => void) =>
    ipcRenderer.removeListener('conductord:logs', callback),


  // Conductord REST proxy (routes through main process -> Unix socket)
  conductordHealth: () => ipcRenderer.invoke('conductord:health'),
  conductordGetSessions: () => ipcRenderer.invoke('conductord:getSessions'),
  conductordGetTmuxSessions: () => ipcRenderer.invoke('conductord:getTmuxSessions'),
  conductordKillTmuxSession: (name: string) => ipcRenderer.invoke('conductord:killTmuxSession', name),

  // Debug logging (forwards renderer logs to main process log file)
  logDebug: (msg: string) => ipcRenderer.send('log:debug', msg),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Platform
  platform: process.platform
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
