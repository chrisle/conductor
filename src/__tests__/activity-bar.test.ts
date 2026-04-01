import { describe, it, expect, beforeEach } from 'vitest'
import { useActivityBarStore } from '../store/activityBar'

function resetStore() {
  useActivityBarStore.setState({ activeExtensionId: null })
}

describe('useActivityBarStore', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('setActiveExtension', () => {
    it('sets the active extension id', () => {
      useActivityBarStore.getState().setActiveExtension('terminal')
      expect(useActivityBarStore.getState().activeExtensionId).toBe('terminal')
    })

    it('sets to null to clear', () => {
      useActivityBarStore.getState().setActiveExtension('terminal')
      useActivityBarStore.getState().setActiveExtension(null)
      expect(useActivityBarStore.getState().activeExtensionId).toBeNull()
    })

    it('replaces existing extension', () => {
      useActivityBarStore.getState().setActiveExtension('terminal')
      useActivityBarStore.getState().setActiveExtension('file-explorer')
      expect(useActivityBarStore.getState().activeExtensionId).toBe('file-explorer')
    })
  })

  describe('toggleExtension', () => {
    it('activates an extension when none is active', () => {
      useActivityBarStore.getState().toggleExtension('terminal')
      expect(useActivityBarStore.getState().activeExtensionId).toBe('terminal')
    })

    it('deactivates the current extension when toggled again', () => {
      useActivityBarStore.getState().toggleExtension('terminal')
      useActivityBarStore.getState().toggleExtension('terminal')
      expect(useActivityBarStore.getState().activeExtensionId).toBeNull()
    })

    it('switches to a different extension', () => {
      useActivityBarStore.getState().toggleExtension('terminal')
      useActivityBarStore.getState().toggleExtension('file-explorer')
      expect(useActivityBarStore.getState().activeExtensionId).toBe('file-explorer')
    })

    it('deactivates after switching and toggling same', () => {
      useActivityBarStore.getState().toggleExtension('terminal')
      useActivityBarStore.getState().toggleExtension('file-explorer')
      useActivityBarStore.getState().toggleExtension('file-explorer')
      expect(useActivityBarStore.getState().activeExtensionId).toBeNull()
    })
  })
})
