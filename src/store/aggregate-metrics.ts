import { create } from 'zustand'

export interface TabMetrics {
  inputSpeed: number | null
  outputSpeed: number | null
}

interface AggregateMetricsState {
  /** Per-tab metrics keyed by tabId */
  tabs: Record<string, TabMetrics>

  /** Update metrics for a specific tab. Call with null to clear. */
  setTabMetrics: (tabId: string, metrics: TabMetrics | null) => void

  /** Remove a tab's metrics entirely (e.g. on unmount). */
  removeTab: (tabId: string) => void
}

export const useAggregateMetricsStore = create<AggregateMetricsState>((set) => ({
  tabs: {},

  setTabMetrics: (tabId, metrics) =>
    set((state) => {
      if (!metrics) {
        if (!(tabId in state.tabs)) return state
        const { [tabId]: _, ...rest } = state.tabs
        return { tabs: rest }
      }
      return { tabs: { ...state.tabs, [tabId]: metrics } }
    }),

  removeTab: (tabId) =>
    set((state) => {
      if (!(tabId in state.tabs)) return state
      const { [tabId]: _, ...rest } = state.tabs
      return { tabs: rest }
    }),
}))

/**
 * Derive the summed input/output token speeds across all active tabs.
 * Returns null for a direction if no tab is reporting a speed for it.
 */
export function selectAggregateSpeeds(state: AggregateMetricsState): {
  inputSpeed: number | null
  outputSpeed: number | null
} {
  let inputSum: number | null = null
  let outputSum: number | null = null

  for (const m of Object.values(state.tabs)) {
    if (m.inputSpeed != null) inputSum = (inputSum ?? 0) + m.inputSpeed
    if (m.outputSpeed != null) outputSum = (outputSum ?? 0) + m.outputSpeed
  }

  return { inputSpeed: inputSum, outputSpeed: outputSum }
}
