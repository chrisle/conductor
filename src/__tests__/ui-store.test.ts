import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../store/ui'

function resetStore() {
  useUIStore.setState({ zoom: 1 })
}

describe('useUIStore zoom', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('setZoom', () => {
    it('sets the zoom to the given value', () => {
      useUIStore.getState().setZoom(1.5)
      expect(useUIStore.getState().zoom).toBe(1.5)
    })

    it('clamps at the minimum (0.5)', () => {
      useUIStore.getState().setZoom(0.1)
      expect(useUIStore.getState().zoom).toBe(0.5)
    })

    it('clamps at the maximum (2.0)', () => {
      useUIStore.getState().setZoom(5.0)
      expect(useUIStore.getState().zoom).toBe(2.0)
    })

    it('persists the value via config store', () => {
      useUIStore.getState().setZoom(1.25)
      expect(window.electronAPI.patchConfig).toHaveBeenCalledWith({ ui: { zoom: 1.25 } })
    })
  })

  describe('zoomIn', () => {
    it('increases zoom by 0.05', () => {
      useUIStore.getState().setZoom(1.0)
      useUIStore.getState().zoomIn()
      expect(useUIStore.getState().zoom).toBeCloseTo(1.05, 5)
    })

    it('does not exceed maximum', () => {
      useUIStore.getState().setZoom(2.0)
      useUIStore.getState().zoomIn()
      expect(useUIStore.getState().zoom).toBe(2.0)
    })
  })

  describe('zoomOut', () => {
    it('decreases zoom by 0.05', () => {
      useUIStore.getState().setZoom(1.0)
      useUIStore.getState().zoomOut()
      expect(useUIStore.getState().zoom).toBeCloseTo(0.95, 5)
    })

    it('does not go below minimum', () => {
      useUIStore.getState().setZoom(0.5)
      useUIStore.getState().zoomOut()
      expect(useUIStore.getState().zoom).toBe(0.5)
    })
  })

  describe('resetZoom', () => {
    it('resets zoom to 1.0', () => {
      useUIStore.getState().setZoom(1.8)
      useUIStore.getState().resetZoom()
      expect(useUIStore.getState().zoom).toBe(1.0)
    })
  })
})
