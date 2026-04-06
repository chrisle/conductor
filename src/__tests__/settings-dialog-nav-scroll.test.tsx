import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsDialog from '../components/SettingsDialog'
import { useSettingsDialogStore } from '../store/settingsDialog'

// Add missing electronAPI methods needed by SettingsDialog
Object.assign(window.electronAPI, {
  listExtensions: vi.fn().mockResolvedValue([]),
  selectExtensionZip: vi.fn().mockResolvedValue(null),
  selectExtensionDir: vi.fn().mockResolvedValue(null),
  installExtension: vi.fn().mockResolvedValue({ success: true }),
  installUnpackedExtension: vi.fn().mockResolvedValue({ success: true }),
  uninstallExtension: vi.fn().mockResolvedValue({ success: true }),
  getExtensionsDir: vi.fn().mockResolvedValue('/tmp/extensions'),
  conductordHealth: vi.fn().mockResolvedValue(true),
  onExtensionInstalled: vi.fn().mockReturnValue(() => {}),
})

describe('SettingsDialog nav scrollability', () => {
  beforeEach(() => {
    // Open the dialog so it renders its content
    useSettingsDialogStore.setState({ open: true, activeSection: 'appearance' })
  })

  afterEach(() => {
    useSettingsDialogStore.setState({ open: false, activeSection: 'general' })
    cleanup()
  })

  it('wraps the nav items in a scrollable container', () => {
    render(<SettingsDialog />)

    // Dialog renders in a portal, so query from document.body
    const nav = document.body.querySelector('nav')
    expect(nav).toBeTruthy()

    // nav should have overflow-hidden to contain the scroll area
    expect(nav!.className).toContain('overflow-hidden')

    // The nav should contain a Radix ScrollArea viewport (rendered by ScrollArea component)
    const viewport = nav!.querySelector('[data-radix-scroll-area-viewport]')
    expect(viewport).toBeTruthy()
  })

  it('keeps the Settings heading outside the scroll area so it stays fixed', () => {
    render(<SettingsDialog />)

    const nav = document.body.querySelector('nav')!

    // The h2 "Settings" should be a direct child of nav, not inside the scroll viewport
    const heading = nav.querySelector('h2')
    expect(heading).toBeTruthy()
    expect(heading!.textContent).toBe('Settings')
    expect(heading!.className).toContain('shrink-0')

    // Heading should NOT be inside the scroll viewport
    const viewport = nav.querySelector('[data-radix-scroll-area-viewport]')
    expect(viewport!.contains(heading)).toBe(false)
  })
})
