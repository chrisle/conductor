import { describe, it, expect } from 'vitest'
import { resolveSettings, DEFAULT_PROJECT_SETTINGS } from '../types/project-settings'

describe('resolveSettings', () => {
  it('returns defaults when no overrides provided', () => {
    expect(resolveSettings()).toEqual(DEFAULT_PROJECT_SETTINGS)
  })

  it('returns defaults when both args are undefined', () => {
    expect(resolveSettings(undefined, undefined)).toEqual(DEFAULT_PROJECT_SETTINGS)
  })

  it('project settings override defaults', () => {
    const result = resolveSettings({ terminal: { tmuxMouse: true } })
    expect(result.terminal.tmuxMouse).toBe(true)
  })

  it('workspace settings override project settings', () => {
    const result = resolveSettings(
      { terminal: { tmuxMouse: true } },
      { terminal: { tmuxMouse: false } },
    )
    expect(result.terminal.tmuxMouse).toBe(false)
  })

  it('workspace settings override defaults when no project settings', () => {
    const result = resolveSettings(undefined, { terminal: { tmuxMouse: true } })
    expect(result.terminal.tmuxMouse).toBe(true)
  })

  it('falls back to project when workspace terminal is undefined', () => {
    const result = resolveSettings(
      { terminal: { tmuxMouse: true } },
      {},
    )
    expect(result.terminal.tmuxMouse).toBe(true)
  })

  it('falls back to default when both project and workspace are empty', () => {
    const result = resolveSettings({}, {})
    expect(result.terminal.tmuxMouse).toBe(DEFAULT_PROJECT_SETTINGS.terminal.tmuxMouse)
  })

  it('partial workspace settings with partial project settings', () => {
    const result = resolveSettings(
      { terminal: { tmuxMouse: true } },
      { terminal: {} },
    )
    // workspace.terminal.tmuxMouse is undefined, so falls back to project
    expect(result.terminal.tmuxMouse).toBe(true)
  })
})

describe('DEFAULT_PROJECT_SETTINGS', () => {
  it('has expected structure', () => {
    expect(DEFAULT_PROJECT_SETTINGS.terminal).toBeDefined()
    expect(DEFAULT_PROJECT_SETTINGS.terminal.tmuxMouse).toBe(false)
  })
})
