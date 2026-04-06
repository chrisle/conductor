import { describe, it, expect } from 'vitest'

import { formatSpeed } from '@/extensions/ai-cli/components/ClaudeCodeTab'

describe('formatSpeed', () => {
  it('returns ∞ for null speed (idle)', () => {
    expect(formatSpeed(null)).toBe('∞')
  })

  it('returns ∞ for zero speed (idle)', () => {
    expect(formatSpeed(0)).toBe('∞')
  })

  it('formats small speeds as plain number with t/s', () => {
    expect(formatSpeed(42)).toBe('42 t/s')
    expect(formatSpeed(999)).toBe('999 t/s')
  })

  it('formats speeds >= 1000 in k notation with t/s', () => {
    expect(formatSpeed(1000)).toBe('1.0k t/s')
    expect(formatSpeed(1234)).toBe('1.2k t/s')
    expect(formatSpeed(15000)).toBe('15.0k t/s')
  })
})
