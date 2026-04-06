import { describe, it, expect } from 'vitest'

import { computeSessionMetrics } from '@/lib/claude-session-metrics'

function makeEntry(
  overrides: {
    type?: string
    model?: string
    input_tokens?: number
    output_tokens?: number
    cache_creation?: number
    cache_read?: number
    timestamp?: string
    isSidechain?: boolean
  } = {},
) {
  return JSON.stringify({
    type: overrides.type ?? 'assistant',
    isSidechain: overrides.isSidechain ?? false,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    message: {
      model: overrides.model ?? 'claude-opus-4-6',
      usage: {
        input_tokens: overrides.input_tokens ?? 10,
        output_tokens: overrides.output_tokens ?? 50,
        cache_creation_input_tokens: overrides.cache_creation ?? 1000,
        cache_read_input_tokens: overrides.cache_read ?? 500,
      },
    },
  })
}

describe('computeSessionMetrics', () => {
  it('returns nulls for empty content', () => {
    const result = computeSessionMetrics('')
    expect(result).toEqual({
      contextPercent: null,
      inputSpeed: null,
      outputSpeed: null,
      model: null,
    })
  })

  it('returns nulls for content with no assistant entries', () => {
    const content = JSON.stringify({
      type: 'user',
      timestamp: new Date().toISOString(),
      message: { content: 'hello' },
    })
    const result = computeSessionMetrics(content)
    expect(result).toEqual({
      contextPercent: null,
      inputSpeed: null,
      outputSpeed: null,
      model: null,
    })
  })

  it('extracts model from the most recent assistant entry', () => {
    const content = [
      makeEntry({ model: 'claude-sonnet-4-6', timestamp: '2026-01-01T00:00:00Z' }),
      makeEntry({ model: 'claude-opus-4-6', timestamp: '2026-01-01T00:01:00Z' }),
    ].join('\n')

    const result = computeSessionMetrics(content)
    expect(result.model).toBe('claude-opus-4-6')
  })

  it('calculates context percentage from last entry input tokens', () => {
    // Opus has 1M context window. Total input = 10 + 5000 + 3000 = 8010
    const content = makeEntry({
      input_tokens: 10,
      cache_creation: 5000,
      cache_read: 3000,
      model: 'claude-opus-4-6',
      timestamp: '2026-01-01T00:00:00Z',
    })

    const result = computeSessionMetrics(content)
    // 8010 / 1_000_000 * 100 = 0.801%
    expect(result.contextPercent).toBeCloseTo(0.801, 2)
  })

  it('uses 200k context window for sonnet models', () => {
    // Sonnet has 200k context. Total input = 10 + 100000 + 50000 = 150010
    const content = makeEntry({
      input_tokens: 10,
      cache_creation: 100000,
      cache_read: 50000,
      model: 'claude-sonnet-4-6',
      timestamp: '2026-01-01T00:00:00Z',
    })

    const result = computeSessionMetrics(content)
    // 150010 / 200000 * 100 = 75.005%
    expect(result.contextPercent).toBeCloseTo(75.005, 2)
  })

  it('caps context percentage at 100%', () => {
    const content = makeEntry({
      input_tokens: 10,
      cache_creation: 150000,
      cache_read: 150000,
      model: 'claude-sonnet-4-6',
      timestamp: '2026-01-01T00:00:00Z',
    })

    const result = computeSessionMetrics(content)
    expect(result.contextPercent).toBe(100)
  })

  it('computes speed from recent entries within the 60s window', () => {
    const now = Date.now()
    const content = [
      makeEntry({
        input_tokens: 5,
        output_tokens: 100,
        cache_creation: 1000,
        cache_read: 500,
        timestamp: new Date(now - 10_000).toISOString(), // 10s ago
      }),
      makeEntry({
        input_tokens: 5,
        output_tokens: 200,
        cache_creation: 1000,
        cache_read: 500,
        timestamp: new Date(now - 5_000).toISOString(), // 5s ago
      }),
    ].join('\n')

    const result = computeSessionMetrics(content)
    // Duration = 5s, total input = (5+1000+500)*2 = 3010, total output = 300
    // inputSpeed = 3010/5 = 602, outputSpeed = 300/5 = 60
    expect(result.inputSpeed).toBe(602)
    expect(result.outputSpeed).toBe(60)
  })

  it('returns null speeds when only one recent entry exists', () => {
    const content = makeEntry({
      timestamp: new Date().toISOString(),
    })

    const result = computeSessionMetrics(content)
    expect(result.inputSpeed).toBeNull()
    expect(result.outputSpeed).toBeNull()
  })

  it('returns null speeds when entries are outside the 60s window', () => {
    const content = [
      makeEntry({ timestamp: '2020-01-01T00:00:00Z' }),
      makeEntry({ timestamp: '2020-01-01T00:00:30Z' }),
    ].join('\n')

    const result = computeSessionMetrics(content)
    expect(result.inputSpeed).toBeNull()
    expect(result.outputSpeed).toBeNull()
    // Context should still be computed from the last entry
    expect(result.contextPercent).not.toBeNull()
  })

  it('ignores sidechain entries', () => {
    const content = [
      makeEntry({
        model: 'claude-sonnet-4-6',
        timestamp: '2026-01-01T00:00:00Z',
      }),
      makeEntry({
        model: 'claude-opus-4-6',
        isSidechain: true,
        timestamp: '2026-01-01T00:01:00Z',
      }),
    ].join('\n')

    const result = computeSessionMetrics(content)
    // Sidechain entry ignored, so model should be from the first entry
    expect(result.model).toBe('claude-sonnet-4-6')
  })

  it('ignores entries without usage data', () => {
    const noUsage = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-01-01T00:01:00Z',
      message: { model: 'claude-opus-4-6' },
    })
    const withUsage = makeEntry({
      model: 'claude-sonnet-4-6',
      timestamp: '2026-01-01T00:00:00Z',
    })

    const result = computeSessionMetrics([withUsage, noUsage].join('\n'))
    expect(result.model).toBe('claude-sonnet-4-6')
  })

  it('skips malformed JSON lines gracefully', () => {
    const content = [
      'not valid json {{{',
      makeEntry({ model: 'claude-opus-4-6', timestamp: '2026-01-01T00:00:00Z' }),
      '}}also broken',
    ].join('\n')

    const result = computeSessionMetrics(content)
    expect(result.model).toBe('claude-opus-4-6')
  })

  it('handles missing optional token fields', () => {
    const content = JSON.stringify({
      type: 'assistant',
      isSidechain: false,
      timestamp: new Date().toISOString(),
      message: {
        model: 'claude-opus-4-6',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          // no cache fields
        },
      },
    })

    const result = computeSessionMetrics(content)
    // Total input = 100 (no cache), context = 100/1M * 100 = 0.01%
    expect(result.contextPercent).toBeCloseTo(0.01, 2)
  })

  it('uses default 200k window for unknown model', () => {
    const content = makeEntry({
      model: 'some-unknown-model',
      input_tokens: 10,
      cache_creation: 100000,
      cache_read: 0,
      timestamp: '2026-01-01T00:00:00Z',
    })

    const result = computeSessionMetrics(content)
    // 100010 / 200000 * 100 = 50.005%
    expect(result.contextPercent).toBeCloseTo(50.005, 2)
  })
})
