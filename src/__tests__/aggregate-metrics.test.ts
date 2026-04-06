import { describe, it, expect, beforeEach } from 'vitest'
import { useAggregateMetricsStore, selectAggregateSpeeds } from '@/store/aggregate-metrics'
import { formatSpeed } from '@/components/Footer'

describe('useAggregateMetricsStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useAggregateMetricsStore.setState({ tabs: {} })
  })

  it('starts with empty tabs', () => {
    const state = useAggregateMetricsStore.getState()
    expect(state.tabs).toEqual({})
  })

  it('sets metrics for a tab', () => {
    useAggregateMetricsStore.getState().setTabMetrics('tab-1', {
      inputSpeed: 100,
      outputSpeed: 50,
    })
    const state = useAggregateMetricsStore.getState()
    expect(state.tabs['tab-1']).toEqual({ inputSpeed: 100, outputSpeed: 50 })
  })

  it('removes a tab when setTabMetrics is called with null', () => {
    useAggregateMetricsStore.getState().setTabMetrics('tab-1', {
      inputSpeed: 100,
      outputSpeed: 50,
    })
    useAggregateMetricsStore.getState().setTabMetrics('tab-1', null)
    expect(useAggregateMetricsStore.getState().tabs).toEqual({})
  })

  it('removeTab removes the tab entry', () => {
    useAggregateMetricsStore.getState().setTabMetrics('tab-1', {
      inputSpeed: 100,
      outputSpeed: 50,
    })
    useAggregateMetricsStore.getState().removeTab('tab-1')
    expect(useAggregateMetricsStore.getState().tabs).toEqual({})
  })

  it('removeTab is a no-op for non-existent tabs', () => {
    const before = useAggregateMetricsStore.getState().tabs
    useAggregateMetricsStore.getState().removeTab('nonexistent')
    expect(useAggregateMetricsStore.getState().tabs).toBe(before)
  })

  it('setTabMetrics with null is a no-op for non-existent tabs', () => {
    const before = useAggregateMetricsStore.getState().tabs
    useAggregateMetricsStore.getState().setTabMetrics('nonexistent', null)
    expect(useAggregateMetricsStore.getState().tabs).toBe(before)
  })
})

describe('selectAggregateSpeeds', () => {
  beforeEach(() => {
    useAggregateMetricsStore.setState({ tabs: {} })
  })

  it('returns nulls when no tabs exist', () => {
    const result = selectAggregateSpeeds(useAggregateMetricsStore.getState())
    expect(result).toEqual({ inputSpeed: null, outputSpeed: null })
  })

  it('returns single tab speeds when only one tab exists', () => {
    useAggregateMetricsStore.getState().setTabMetrics('tab-1', {
      inputSpeed: 200,
      outputSpeed: 80,
    })
    const result = selectAggregateSpeeds(useAggregateMetricsStore.getState())
    expect(result).toEqual({ inputSpeed: 200, outputSpeed: 80 })
  })

  it('sums speeds across multiple tabs', () => {
    useAggregateMetricsStore.getState().setTabMetrics('tab-1', {
      inputSpeed: 200,
      outputSpeed: 80,
    })
    useAggregateMetricsStore.getState().setTabMetrics('tab-2', {
      inputSpeed: 300,
      outputSpeed: 120,
    })
    const result = selectAggregateSpeeds(useAggregateMetricsStore.getState())
    expect(result).toEqual({ inputSpeed: 500, outputSpeed: 200 })
  })

  it('skips null speeds in aggregation', () => {
    useAggregateMetricsStore.getState().setTabMetrics('tab-1', {
      inputSpeed: 200,
      outputSpeed: null,
    })
    useAggregateMetricsStore.getState().setTabMetrics('tab-2', {
      inputSpeed: null,
      outputSpeed: 120,
    })
    const result = selectAggregateSpeeds(useAggregateMetricsStore.getState())
    expect(result).toEqual({ inputSpeed: 200, outputSpeed: 120 })
  })

  it('returns nulls when all tab speeds are null', () => {
    useAggregateMetricsStore.getState().setTabMetrics('tab-1', {
      inputSpeed: null,
      outputSpeed: null,
    })
    const result = selectAggregateSpeeds(useAggregateMetricsStore.getState())
    expect(result).toEqual({ inputSpeed: null, outputSpeed: null })
  })
})

describe('formatSpeed', () => {
  it('returns dash for null', () => {
    expect(formatSpeed(null)).toBe('— t/s')
  })

  it('formats small numbers without suffix', () => {
    expect(formatSpeed(42)).toBe('42 t/s')
  })

  it('formats zero', () => {
    expect(formatSpeed(0)).toBe('0 t/s')
  })

  it('formats 999 without k suffix', () => {
    expect(formatSpeed(999)).toBe('999 t/s')
  })

  it('formats 1000+ with k suffix', () => {
    expect(formatSpeed(1000)).toBe('1.0k t/s')
  })

  it('formats large numbers with k suffix', () => {
    expect(formatSpeed(1234)).toBe('1.2k t/s')
  })

  it('formats very large numbers', () => {
    expect(formatSpeed(15000)).toBe('15.0k t/s')
  })
})
