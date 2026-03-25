import { describe, it, expect } from 'vitest'
import { cn } from '../lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'end')).toBe('base end')
  })

  it('deduplicates conflicting tailwind classes', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('')
  })

  it('handles undefined and null values', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b')
  })
})
