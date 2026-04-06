import { describe, it, expect } from 'vitest'

/**
 * Tests for the usage label/color derivation logic in Footer.
 * These validate the conditions used to determine when to show
 * "Extra usage" vs the actual percentage in the footer.
 *
 * The bug (CON-68): the label showed "Extra usage" whenever an
 * extra-usage tier existed with percent > 0, even if the all-models
 * tier wasn't at 100%. The fix requires BOTH conditions to be true.
 */

interface UsageTier {
  label: string
  percent: number
  resets: string | null
  resetsAt: string | null
  spent: string | null
}

/** Mirrors the label derivation logic from Footer/index.tsx */
function deriveLabel(opts: {
  scraping: boolean
  error: string | null
  percentUsed: number | null
  sessionPercent: number | null
  tiers: UsageTier[]
}): string {
  const { scraping, error, percentUsed, sessionPercent, tiers } = opts
  const hasExtraUsage = tiers.some(t => t.label === 'Extra usage' && t.percent > 0)
  const allModelsAt100 = (percentUsed ?? 0) >= 100
  const displayPercent = sessionPercent ?? percentUsed

  return scraping
    ? 'Checking...'
    : error
      ? 'Usage: error'
      : (allModelsAt100 && hasExtraUsage)
        ? 'Extra usage'
        : displayPercent != null
          ? `Usage: ${displayPercent}%`
          : 'Usage: --'
}

/** Mirrors the isOverage derivation logic from Footer/index.tsx */
function deriveIsOverage(percentUsed: number | null, tiers: UsageTier[]): boolean {
  const hasExtraUsage = tiers.some(t => t.label === 'Extra usage' && t.percent > 0)
  const allModelsAt100 = (percentUsed ?? 0) >= 100
  return allModelsAt100 && hasExtraUsage
}

const extraTier = (pct: number): UsageTier => ({
  label: 'Extra usage',
  percent: pct,
  resets: null,
  resetsAt: null,
  spent: '$1.96 / $100.00 spent',
})

const allModelsTier = (pct: number): UsageTier => ({
  label: 'All models',
  percent: pct,
  resets: 'Resets Apr 10 at 7am',
  resetsAt: '2026-04-10T07:00:00.000Z',
  spent: null,
})

describe('usage label derivation (CON-68)', () => {
  it('shows percentage when extra usage tier exists but all-models is NOT at 100%', () => {
    // This is the exact bug scenario: extra tier has 1%, but all-models is only 14%
    const label = deriveLabel({
      scraping: false,
      error: null,
      percentUsed: 14,
      sessionPercent: null,
      tiers: [allModelsTier(14), extraTier(1)],
    })
    expect(label).toBe('Usage: 14%')
  })

  it('shows "Extra usage" only when all-models is at 100% AND extra tier is active', () => {
    const label = deriveLabel({
      scraping: false,
      error: null,
      percentUsed: 100,
      sessionPercent: null,
      tiers: [allModelsTier(100), extraTier(5)],
    })
    expect(label).toBe('Extra usage')
  })

  it('shows percentage when all-models is at 100% but no extra tier exists', () => {
    const label = deriveLabel({
      scraping: false,
      error: null,
      percentUsed: 100,
      sessionPercent: null,
      tiers: [allModelsTier(100)],
    })
    expect(label).toBe('Usage: 100%')
  })

  it('shows session percent when available, not all-models percent', () => {
    const label = deriveLabel({
      scraping: false,
      error: null,
      percentUsed: 50,
      sessionPercent: 75,
      tiers: [allModelsTier(50)],
    })
    expect(label).toBe('Usage: 75%')
  })

  it('shows "Checking..." while scraping', () => {
    const label = deriveLabel({
      scraping: true,
      error: null,
      percentUsed: null,
      sessionPercent: null,
      tiers: [],
    })
    expect(label).toBe('Checking...')
  })

  it('shows error state', () => {
    const label = deriveLabel({
      scraping: false,
      error: 'timeout',
      percentUsed: null,
      sessionPercent: null,
      tiers: [],
    })
    expect(label).toBe('Usage: error')
  })

  it('shows "--" when no data', () => {
    const label = deriveLabel({
      scraping: false,
      error: null,
      percentUsed: null,
      sessionPercent: null,
      tiers: [],
    })
    expect(label).toBe('Usage: --')
  })
})

describe('isOverage derivation (CON-68)', () => {
  it('is NOT overage when extra tier exists but all-models < 100%', () => {
    expect(deriveIsOverage(14, [allModelsTier(14), extraTier(1)])).toBe(false)
  })

  it('is overage when all-models >= 100% AND extra tier is active', () => {
    expect(deriveIsOverage(100, [allModelsTier(100), extraTier(5)])).toBe(true)
  })

  it('is NOT overage when all-models >= 100% but no extra tier', () => {
    expect(deriveIsOverage(100, [allModelsTier(100)])).toBe(false)
  })

  it('is NOT overage with no tiers', () => {
    expect(deriveIsOverage(50, [])).toBe(false)
  })

  it('is NOT overage when extra tier has 0%', () => {
    expect(deriveIsOverage(100, [allModelsTier(100), extraTier(0)])).toBe(false)
  })
})
