import { describe, it, expect } from 'vitest'
import { nanoid } from '../lib/nanoid'

describe('nanoid', () => {
  it('returns a non-empty string', () => {
    expect(nanoid()).toBeTruthy()
  })

  it('returns unique ids on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => nanoid()))
    expect(ids.size).toBe(100)
  })

  it('contains expected segments separated by hyphens', () => {
    const id = nanoid()
    const parts = id.split('-')
    expect(parts.length).toBeGreaterThanOrEqual(3)
  })
})
