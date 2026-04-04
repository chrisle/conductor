import { describe, it, expect } from 'vitest'
import { resolveSettings, DEFAULT_PROJECT_SETTINGS } from '../types/project-settings'

describe('resolveSettings', () => {
  it('returns defaults when no overrides provided', () => {
    expect(resolveSettings()).toEqual(DEFAULT_PROJECT_SETTINGS)
  })

  it('returns defaults when both args are undefined', () => {
    expect(resolveSettings(undefined, undefined)).toEqual(DEFAULT_PROJECT_SETTINGS)
  })

  it('returns defaults with empty settings', () => {
    const result = resolveSettings({}, {})
    expect(result.terminal).toEqual(DEFAULT_PROJECT_SETTINGS.terminal)
  })
})

describe('DEFAULT_PROJECT_SETTINGS', () => {
  it('has expected structure', () => {
    expect(DEFAULT_PROJECT_SETTINGS.terminal).toBeDefined()
  })
})
