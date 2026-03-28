import { create } from 'zustand'

const ZOOM_KEY = 'conductor:zoom'
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.05

function loadZoom(): number {
  try {
    const v = parseFloat(localStorage.getItem(ZOOM_KEY) || '1')
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, isNaN(v) ? 1 : v))
  } catch { return 1 }
}

interface UIState {
  zoom: number
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

export const useUIStore = create<UIState>((set, get) => ({
  zoom: loadZoom(),

  setZoom: (zoom) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
    localStorage.setItem(ZOOM_KEY, String(clamped))
    set({ zoom: clamped })
  },

  zoomIn: () => {
    const next = Math.round((get().zoom + ZOOM_STEP) * 100) / 100
    get().setZoom(next)
  },

  zoomOut: () => {
    const next = Math.round((get().zoom - ZOOM_STEP) * 100) / 100
    get().setZoom(next)
  },

  resetZoom: () => get().setZoom(1),
}))
