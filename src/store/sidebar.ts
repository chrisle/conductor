import { create } from 'zustand'

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
}

export interface SidebarState {
  width: number
  isVisible: boolean
  rootPath: string | null
  expandedPaths: Set<string>
  favorites: string[]
  selectedPath: string | null
  setWidth: (width: number) => void
  toggleVisibility: () => void
  setRootPath: (path: string) => void
  toggleExpanded: (path: string) => void
  isExpanded: (path: string) => boolean
  collapseAll: () => void
  addFavorite: (path: string) => void
  removeFavorite: (path: string) => void
  isFavorite: (path: string) => boolean
  setSelectedPath: (path: string | null) => void
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  width: 240,
  isVisible: true,
  rootPath: null,
  expandedPaths: new Set<string>(),
  favorites: [],
  selectedPath: null,

  setWidth: (width) => set({ width: Math.max(220, Math.min(600, width)) }),

  toggleVisibility: () => set(state => ({ isVisible: !state.isVisible })),

  setRootPath: (path) => set({ rootPath: path }),

  toggleExpanded: (path) => {
    set(state => {
      const newSet = new Set(state.expandedPaths)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return { expandedPaths: newSet }
    })
  },

  isExpanded: (path) => get().expandedPaths.has(path),

  collapseAll: () => set({ expandedPaths: new Set() }),

  addFavorite: (path) => set(state => {
    if (state.favorites.includes(path)) return state
    const next = [...state.favorites, path]
    window.electronAPI.saveFavorites(next)
    return { favorites: next }
  }),

  removeFavorite: (path) => set(state => {
    const next = state.favorites.filter(f => f !== path)
    window.electronAPI.saveFavorites(next)
    return { favorites: next }
  }),

  isFavorite: (path) => get().favorites.includes(path),

  setSelectedPath: (path) => set({ selectedPath: path }),
}))
