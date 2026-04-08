/**
 * Lightweight performance measurement utility.
 *
 * Enabled automatically when window.__PERF__ = true, or always active
 * when localStorage key "conductor.perf" is set to "1".
 *
 * Usage in browser DevTools console:
 *   localStorage.setItem('conductor.perf', '1') // enable
 *   localStorage.removeItem('conductor.perf')   // disable
 *   window.__perfSummary()                      // print summary
 *   window.__perfClear()                        // clear all data
 */

const STORAGE_KEY = 'conductor.perf'

function isEnabled(): boolean {
  return (
    (window as any).__PERF__ === true ||
    localStorage.getItem(STORAGE_KEY) === '1'
  )
}

// Accumulated measurements: label → array of durations (ms)
const measurements: Record<string, number[]> = {}

/** Mark the start of a measurement. Returns a stop function. */
export function perfStart(label: string): () => void {
  if (!isEnabled()) return () => {}
  const t0 = performance.now()
  return () => {
    const duration = performance.now() - t0
    if (!measurements[label]) measurements[label] = []
    measurements[label].push(duration)
    if (duration > 16) {
      // Log anything that exceeded one frame budget
      console.debug(`[perf] ${label}: ${duration.toFixed(1)}ms`)
    }
  }
}

/** Measure how long a synchronous function takes. */
export function perfMeasure<T>(label: string, fn: () => T): T {
  if (!isEnabled()) return fn()
  const stop = perfStart(label)
  const result = fn()
  stop()
  return result
}

function summary() {
  if (Object.keys(measurements).length === 0) {
    console.log('[perf] No measurements yet. Enable with: localStorage.setItem("conductor.perf","1")')
    return
  }
  const rows: { label: string; count: number; avg: string; p50: string; p95: string; max: string }[] = []
  for (const [label, times] of Object.entries(measurements)) {
    const sorted = [...times].sort((a, b) => a - b)
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const p50 = sorted[Math.floor(sorted.length * 0.5)]
    const p95 = sorted[Math.floor(sorted.length * 0.95)]
    const max = sorted[sorted.length - 1]
    rows.push({
      label,
      count: times.length,
      avg: avg.toFixed(1) + 'ms',
      p50: p50.toFixed(1) + 'ms',
      p95: p95.toFixed(1) + 'ms',
      max: max.toFixed(1) + 'ms',
    })
  }
  console.table(rows)
}

function clear() {
  for (const key of Object.keys(measurements)) delete measurements[key]
  console.log('[perf] Cleared.')
}

// Expose helpers on window for DevTools access and E2E tests
;(window as any).__perfSummary = summary
;(window as any).__perfClear = clear
;(window as any).__perfMeasurements = measurements
