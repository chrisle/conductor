import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

const electronAPI = {
  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

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

  // Platform
  platform: process.platform
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
