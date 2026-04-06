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

describe('SettingsDialog scrollability', () => {
  beforeEach(() => {
    useSettingsDialogStore.setState({ open: true, activeSection: 'appearance' })
  })

  afterEach(() => {
    useSettingsDialogStore.setState({ open: false, activeSection: 'general' })
    cleanup()
  })

  it('constrains the main flex container so content does not overflow the dialog', () => {
    render(<SettingsDialog />)

    // The dialog renders in a portal; query from document.body
    // Find the flex container that holds nav + content (direct child of DialogContent)
    const flexContainer = document.body.querySelector('.flex.h-full.min-h-0')
    expect(flexContainer).toBeTruthy()
  })

  it('wraps the right-side content area in a scrollable ScrollArea', () => {
    render(<SettingsDialog />)

    // The content area is the sibling of the nav element
    const nav = document.body.querySelector('nav')
    expect(nav).toBeTruthy()

    // Content area is the next sibling
    const contentArea = nav!.nextElementSibling as HTMLElement
    expect(contentArea).toBeTruthy()
    expect(contentArea.className).toContain('overflow-hidden')

    // It should contain a Radix ScrollArea viewport for scrolling
    const viewport = contentArea.querySelector('[data-radix-scroll-area-viewport]')
    expect(viewport).toBeTruthy()
  })

  it('wraps the left nav items in a scrollable container', () => {
    render(<SettingsDialog />)

    const nav = document.body.querySelector('nav')
    expect(nav).toBeTruthy()
    expect(nav!.className).toContain('overflow-hidden')

    // The nav should contain a Radix ScrollArea viewport
    const viewport = nav!.querySelector('[data-radix-scroll-area-viewport]')
    expect(viewport).toBeTruthy()
  })
})
