import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_KEYBOARD_SHORTCUTS } from '../types/app-config'
import { useActivityBarStore } from '../store/activityBar'

describe('panel keyboard shortcuts', () => {
  describe('DEFAULT_KEYBOARD_SHORTCUTS panel entries', () => {
    it('includes panel1 through panel9 shortcuts', () => {
      for (let i = 1; i <= 9; i++) {
        const shortcut = DEFAULT_KEYBOARD_SHORTCUTS.find(s => s.id === `panel${i}`)
        expect(shortcut).toBeDefined()
        expect(shortcut!.keys).toBe(`Meta+${i}`)
        expect(shortcut!.label).toBe(`Panel ${i}`)
      }
    })

    it('does not conflict with existing shortcuts', () => {
      const panelKeys = DEFAULT_KEYBOARD_SHORTCUTS
        .filter(s => s.id.startsWith('panel'))
        .map(s => s.keys)
      const otherKeys = DEFAULT_KEYBOARD_SHORTCUTS
        .filter(s => !s.id.startsWith('panel'))
        .map(s => s.keys)

      for (const key of panelKeys) {
        expect(otherKeys).not.toContain(key)
      }
    })
  })

  describe('toggleExtension behavior for panel shortcuts', () => {
    beforeEach(() => {
      useActivityBarStore.setState({
        activeExtensionId: null,
        lastActiveExtensionId: null,
      })
    })

    it('activates a panel when none is active', () => {
      useActivityBarStore.getState().toggleExtension('project')
      expect(useActivityBarStore.getState().activeExtensionId).toBe('project')
    })

    it('deactivates a panel when the same shortcut is pressed again', () => {
      useActivityBarStore.getState().toggleExtension('project')
      useActivityBarStore.getState().toggleExtension('project')
      expect(useActivityBarStore.getState().activeExtensionId).toBeNull()
    })

    it('switches between panels', () => {
      useActivityBarStore.getState().toggleExtension('project')
      useActivityBarStore.getState().toggleExtension('file-explorer')
      expect(useActivityBarStore.getState().activeExtensionId).toBe('file-explorer')
    })

    it('remembers last active extension after deactivation', () => {
      useActivityBarStore.getState().toggleExtension('project')
      useActivityBarStore.getState().toggleExtension('project')
      expect(useActivityBarStore.getState().lastActiveExtensionId).toBe('project')
    })
  })
})
