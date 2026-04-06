import { describe, it, expect } from 'vitest'
import { terminalColors, terminalConfig } from '../extensions/terminal/theme'

describe('terminalColors', () => {
  it('defines all required color fields', () => {
    const requiredFields = [
      'background', 'foreground', 'cursor', 'cursorAccent', 'selectionBackground',
      'black', 'brightBlack', 'red', 'brightRed', 'green', 'brightGreen',
      'yellow', 'brightYellow', 'blue', 'brightBlue', 'magenta', 'brightMagenta',
      'cyan', 'brightCyan', 'white', 'brightWhite',
    ]
    for (const field of requiredFields) {
      expect(terminalColors).toHaveProperty(field)
    }
  })

  it('all values are valid hex color strings', () => {
    for (const [key, value] of Object.entries(terminalColors)) {
      expect(value, `${key} should be a hex color`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('uses dark background', () => {
    expect(terminalColors.background).toBe('#09090b')
  })

  it('uses light foreground', () => {
    expect(terminalColors.foreground).toBe('#e4e4e7')
  })
})

describe('terminalConfig', () => {
  it('uses terminal colors as theme', () => {
    expect(terminalConfig.theme).toBe(terminalColors)
  })

  it('uses FiraCode Nerd Font', () => {
    expect(terminalConfig.fontFamily).toContain('FiraCode Nerd Font Mono')
  })

  it('has reasonable font size', () => {
    expect(terminalConfig.fontSize).toBeGreaterThanOrEqual(8)
    expect(terminalConfig.fontSize).toBeLessThanOrEqual(24)
  })

  it('has cursor blink enabled', () => {
    expect(terminalConfig.cursorBlink).toBe(true)
  })

  it('has block cursor style', () => {
    expect(terminalConfig.cursorStyle).toBe('block')
  })

  it('has scrollback buffer defaulting to 10000 lines', () => {
    expect(terminalConfig.scrollback).toBe(10000)
  })
})
