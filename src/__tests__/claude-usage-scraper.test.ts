import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { parseUsageOutput, parseResetToISO, formatResetCountdown } from '@/lib/claude-usage-scraper'

describe('parseUsageOutput', () => {
  it('parses a typical multi-tier output', () => {
    const raw = [
      'Current week (all models) ██████▌ 13% used Resets Apr 10 at 7am (America/Los_Angeles)',
      'Current week (Sonnet only) ██ 4% used Resets Apr 11 at 11:59am (America/Los_Angeles)',
      'Extra usage █ 1% used $1.96 / $100.00 spent · Resets May 1 (America/Los_Angeles)',
    ].join('\n')

    const result = parseUsageOutput(raw)
    expect(result.percentUsed).toBe(13)
    expect(result.tiers).toHaveLength(3)
    expect(result.tiers[0].label).toBe('All models')
    expect(result.tiers[0].percent).toBe(13)
    expect(result.tiers[0].resets).toBe('Resets Apr 10 at 7am')
    expect(result.tiers[0].resetsAt).toBeTypeOf('string')
    expect(result.tiers[1].label).toBe('Sonnet only')
    expect(result.tiers[1].percent).toBe(4)
    expect(result.tiers[2].label).toBe('Extra usage')
    expect(result.tiers[2].spent).toBe('$1.96 / $100.00 spent')
  })

  it('parses session percentage', () => {
    const raw = 'Current session ████ 55% used\nCurrent week (all models) ██ 10% used Resets Apr 10 at 7am'
    const result = parseUsageOutput(raw)
    expect(result.sessionPercent).toBe(55)
    expect(result.percentUsed).toBe(10)
  })

  it('returns null for unrecognized input', () => {
    const result = parseUsageOutput('no usage data here')
    expect(result.percentUsed).toBeNull()
    expect(result.sessionPercent).toBeNull()
    expect(result.tiers).toHaveLength(0)
  })

  it('includes resetsAt as an ISO string for each tier with a reset', () => {
    const raw = 'Current week (all models) ██ 30% used Resets Apr 10 at 7am (America/Los_Angeles)'
    const result = parseUsageOutput(raw)
    expect(result.tiers[0].resetsAt).not.toBeNull()
    // Should be a valid ISO date
    const d = new Date(result.tiers[0].resetsAt!)
    expect(d.getTime()).not.toBeNaN()
  })

  it('sets resetsAt to null when no reset info', () => {
    // Fabricate a tier without a Resets line
    const raw = 'Current session ██ 20% used'
    const result = parseUsageOutput(raw)
    expect(result.tiers[0].resetsAt).toBeNull()
  })
})

describe('parseResetToISO', () => {
  let realDate: DateConstructor

  beforeEach(() => {
    realDate = globalThis.Date
    // Fix "now" to 2026-04-06T12:00:00Z for predictable tests
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('parses "Resets Apr 10 at 7am"', () => {
    const iso = parseResetToISO('Resets Apr 10 at 7am')
    expect(iso).not.toBeNull()
    const d = new Date(iso!)
    expect(d.getMonth()).toBe(3) // April = 3
    expect(d.getDate()).toBe(10)
    expect(d.getHours()).toBe(7)
  })

  it('parses "Resets Apr 11 at 11:59am"', () => {
    const iso = parseResetToISO('Resets Apr 11 at 11:59am')
    expect(iso).not.toBeNull()
    const d = new Date(iso!)
    expect(d.getDate()).toBe(11)
    expect(d.getHours()).toBe(11)
    expect(d.getMinutes()).toBe(59)
  })

  it('parses "Resets May 1" (date only)', () => {
    const iso = parseResetToISO('Resets May 1')
    expect(iso).not.toBeNull()
    const d = new Date(iso!)
    expect(d.getMonth()).toBe(4) // May = 4
    expect(d.getDate()).toBe(1)
  })

  it('parses PM times correctly', () => {
    const iso = parseResetToISO('Resets Apr 10 at 3pm')
    const d = new Date(iso!)
    expect(d.getHours()).toBe(15)
  })

  it('parses 12pm as noon', () => {
    const iso = parseResetToISO('Resets Apr 10 at 12pm')
    const d = new Date(iso!)
    expect(d.getHours()).toBe(12)
  })

  it('parses 12am as midnight', () => {
    const iso = parseResetToISO('Resets Apr 10 at 12am')
    const d = new Date(iso!)
    expect(d.getHours()).toBe(0)
  })

  it('returns null for unrecognized format', () => {
    expect(parseResetToISO('something random')).toBeNull()
  })

  it('rolls to next year if date is in the past', () => {
    // "Resets Jan 1 at 12am" is in the past relative to April 2026
    const iso = parseResetToISO('Resets Jan 1 at 12am')
    const d = new Date(iso!)
    expect(d.getFullYear()).toBe(2027)
  })
})

describe('formatResetCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Resets in Xh" for hours away', () => {
    const target = new Date('2026-04-06T15:00:00Z').toISOString() // 3 hours later
    expect(formatResetCountdown(target, null)).toBe('Resets in 3h')
  })

  it('returns "Resets in Xm" for minutes away', () => {
    const target = new Date('2026-04-06T12:45:00Z').toISOString() // 45 min later
    expect(formatResetCountdown(target, null)).toBe('Resets in 45m')
  })

  it('returns "Resets in Xd" for days away', () => {
    const target = new Date('2026-04-09T12:00:00Z').toISOString() // 3 days later
    expect(formatResetCountdown(target, null)).toBe('Resets in 3d')
  })

  it('returns "Resets in <1m" for very near future', () => {
    const target = new Date('2026-04-06T12:00:30Z').toISOString() // 30 seconds later
    expect(formatResetCountdown(target, null)).toBe('Resets in <1m')
  })

  it('returns fallback when resetsAt is null', () => {
    expect(formatResetCountdown(null, 'Resets Apr 10 at 7am')).toBe('Resets Apr 10 at 7am')
  })

  it('returns fallback when target is in the past', () => {
    const past = new Date('2026-04-06T11:00:00Z').toISOString() // 1 hour ago
    expect(formatResetCountdown(past, 'Resets Apr 6')).toBe('Resets Apr 6')
  })

  it('returns null when both resetsAt and fallback are null', () => {
    expect(formatResetCountdown(null, null)).toBeNull()
  })
})
