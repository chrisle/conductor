import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsDialogStore } from '../store/settingsDialog'

function resetStore() {
  useSettingsDialogStore.setState({ open: false, activeSection: 'general' })
}

describe('useSettingsDialogStore', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('initial state', () => {
    it('starts closed', () => {
      expect(useSettingsDialogStore.getState().open).toBe(false)
    })

    it('defaults to general section', () => {
      expect(useSettingsDialogStore.getState().activeSection).toBe('general')
    })
  })

  describe('setOpen', () => {
    it('opens the dialog', () => {
      useSettingsDialogStore.getState().setOpen(true)
      expect(useSettingsDialogStore.getState().open).toBe(true)
    })

    it('closes the dialog', () => {
      useSettingsDialogStore.getState().setOpen(true)
      useSettingsDialogStore.getState().setOpen(false)
      expect(useSettingsDialogStore.getState().open).toBe(false)
    })

    it('does not change activeSection when opening', () => {
      useSettingsDialogStore.getState().setActiveSection('extensions')
      useSettingsDialogStore.getState().setOpen(true)
      expect(useSettingsDialogStore.getState().activeSection).toBe('extensions')
    })
  })

  describe('setActiveSection', () => {
    it('changes the active section', () => {
      useSettingsDialogStore.getState().setActiveSection('extensions')
      expect(useSettingsDialogStore.getState().activeSection).toBe('extensions')
    })

    it('can set to any string', () => {
      useSettingsDialogStore.getState().setActiveSection('ai-cli')
      expect(useSettingsDialogStore.getState().activeSection).toBe('ai-cli')
    })
  })

  describe('openToSection', () => {
    it('opens the dialog and sets the section', () => {
      useSettingsDialogStore.getState().openToSection('extensions')
      expect(useSettingsDialogStore.getState().open).toBe(true)
      expect(useSettingsDialogStore.getState().activeSection).toBe('extensions')
    })

    it('changes section even if already open', () => {
      useSettingsDialogStore.getState().setOpen(true)
      useSettingsDialogStore.getState().setActiveSection('general')
      useSettingsDialogStore.getState().openToSection('ai-cli')
      expect(useSettingsDialogStore.getState().open).toBe(true)
      expect(useSettingsDialogStore.getState().activeSection).toBe('ai-cli')
    })
  })
})
