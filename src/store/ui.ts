import { create } from 'zustand'
import { useConfigStore } from './config'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.05

interface UIState {
  zoom: number
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  goToOpen: boolean
  setGoToOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set, get) => ({
  zoom: 1,

  setZoom: (zoom) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
    set({ zoom: clamped })
    useConfigStore.getState().setZoom(clamped)
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

  goToOpen: false,
  setGoToOpen: (open) => set({ goToOpen: open }),
}))

// Hydrate zoom from config store once it's ready
useConfigStore.subscribe((state) => {
  if (state.ready) {
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, state.config.ui.zoom))
    useUIStore.setState({ zoom })
  }
})
