/**
 * Real Electron performance test — measures actual rendering latency
 * with real PTY sessions, real React renders, and real Zustand updates.
 *
 * Unlike perf-stress.spec.ts (which uses mocks), this test launches the
 * full Electron app and measures what the user actually experiences.
 *
 * Run explicitly with:
 *   npx playwright test e2e/perf-real.spec.ts --reporter=list
 *
 * Requires conductord to be installed. The test manages the Electron
 * process lifecycle automatically.
 */
import { test, expect } from '@playwright/test'
import type { Browser, Page } from 'playwright'
import type { ChildProcess } from 'child_process'

import {
  killAllConductorProcesses,
  launchElectronApp,
  waitForAppAndResetToEmptyProject,
} from './real-helpers'

// ─── Config ───────────────────────────────────────────────────────────────────

const N_TABS = 5            // real PTY sessions to open
const N_SWITCHES = 30       // tab switches to benchmark
const N_WARMUP = 5          // warm-up switches (not measured)

// Thresholds — real rendering involves GPU, layout, and real React reconciliation
const MAX_P95_IDLE_SWITCH_MS = 50     // idle terminals: tab switch to next rAF
const MAX_P95_LOAD_SWITCH_MS = 100    // all terminals streaming: tab switch to next rAF

// The bash command run in each terminal to simulate an active Claude session.
// It produces output matching THINKING_RE in terminal-detection.ts so
// useThinkingDetect fires updateTab({ isThinking: true }) on every PTY chunk —
// the same Zustand mutation that real Claude causes while thinking.
const THINKING_LOOP =
  "while true; do printf '(1s \\u00b7 \\u2191 %d tokens)\\r' \"$((RANDOM % 9999))\"; sleep 0.1; done\n"

// ─── Test state ───────────────────────────────────────────────────────────────

let electronProcess: ChildProcess
let browser: Browser
let page: Page
let tabIds: string[] = []

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Real Electron performance (requires conductord)', () => {

  test.beforeAll(async () => {
    test.setTimeout(180_000)

    killAllConductorProcesses()
    await new Promise(r => setTimeout(r, 2000))

    const app = await launchElectronApp()
    electronProcess = app.electronProcess
    browser = app.browser
    page = app.page

    await waitForAppAndResetToEmptyProject(page)

    // Enable perf instrumentation for perfStart marks
    await page.evaluate(() => { localStorage.setItem('conductor.perf', '1') })

    // Open N real terminal tabs, waiting for each shell to be ready
    tabIds = await openRealTerminals(page, N_TABS)
    console.log(`\n  Opened ${tabIds.length} real terminal tabs`)
  })

  test.afterAll(async () => {
    try { await browser?.close() } catch {}
    if (electronProcess) electronProcess.kill('SIGKILL')
    killAllConductorProcesses()
  })

  // ─── Test 1: idle terminals ─────────────────────────────────────────────────

  test(`tab switch latency — ${N_TABS} idle terminals`, async () => {
    test.setTimeout(90_000)

    // Warm up: get React reconciler and GPU warmed
    await switchTabsViaStore(page, tabIds, N_WARMUP)
    await page.evaluate(() => { (window as any).__perfClear?.() })

    // Benchmark
    const durations = await measureRafSwitchLatency(page, tabIds, N_SWITCHES)
    const metrics = computeMetrics(durations)
    printMetrics(`Tab switch — ${N_TABS} idle terminals`, metrics)

    expect(
      metrics.p95,
      `p95 idle tab switch (${metrics.p95.toFixed(1)}ms) exceeded ${MAX_P95_IDLE_SWITCH_MS}ms`,
    ).toBeLessThan(MAX_P95_IDLE_SWITCH_MS)
  })

  // ─── Test 2: all terminals streaming (concurrent Claude sessions) ────────────

  test(`tab switch latency — ${N_TABS} terminals with concurrent PTY output`, async () => {
    test.setTimeout(90_000)

    // Start the thinking loop in every terminal simultaneously.
    // This fires useThinkingDetect → updateTab({ isThinking: true }) at ~10Hz per tab,
    // which is the same Zustand pressure real Claude sessions produce.
    for (const id of tabIds) {
      await page.evaluate(
        ({ id, cmd }: { id: string; cmd: string }) => { window.electronAPI.writeTerminal(id, cmd) },
        { id, cmd: THINKING_LOOP },
      )
      await new Promise(r => setTimeout(r, 50))
    }

    // Let output establish for 1s so isThinking is active in all tabs
    await new Promise(r => setTimeout(r, 1000))

    await switchTabsViaStore(page, tabIds, N_WARMUP)
    await page.evaluate(() => { (window as any).__perfClear?.() })

    const durations = await measureRafSwitchLatency(page, tabIds, N_SWITCHES)
    const metrics = computeMetrics(durations)
    printMetrics(`Tab switch — ${N_TABS} concurrent streaming terminals`, metrics)

    // Stop all loops (Ctrl+C each)
    for (const id of tabIds) {
      await page.evaluate(
        ({ id }: { id: string }) => { window.electronAPI.writeTerminal(id, '\x03') },
        { id },
      )
    }

    expect(
      metrics.p95,
      `p95 concurrent switch (${metrics.p95.toFixed(1)}ms) exceeded ${MAX_P95_LOAD_SWITCH_MS}ms`,
    ).toBeLessThan(MAX_P95_LOAD_SWITCH_MS)
  })

  // ─── Test 3: perf marks from real render instrumentation ────────────────────

  test('print perf marks collected from real renders', async () => {
    test.setTimeout(30_000)

    const perfSummary = await page.evaluate(() => {
      const measurements: Record<string, number[]> = (window as any).__perfMeasurements || {}
      const result: Record<string, { count: number; avg: number; p95: number; max: number }> = {}
      for (const [label, times] of Object.entries(measurements)) {
        const sorted = [...times].sort((a, b) => a - b)
        result[label] = {
          count: times.length,
          avg: times.reduce((a, b) => a + b, 0) / times.length,
          p95: sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1],
          max: sorted[sorted.length - 1],
        }
      }
      return result
    })

    console.log('\n  Perf marks from real render instrumentation:')
    if (Object.keys(perfSummary).length === 0) {
      console.log('  (none — perf marks are only emitted when conductor.perf=1 is set)')
    }
    for (const [label, m] of Object.entries(perfSummary)) {
      console.log(
        `  ${label}: count=${m.count}  avg=${m.avg.toFixed(1)}ms  p95=${m.p95.toFixed(1)}ms  max=${m.max.toFixed(1)}ms`,
      )
    }

    // Informational — no threshold, just makes results visible
    expect(true).toBe(true)
  })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Open N real terminal tabs via the Zustand store.
 * Waits for each tab's shell to produce a prompt before proceeding.
 */
async function openRealTerminals(page: Page, count: number): Promise<string[]> {
  const ids: string[] = []

  for (let i = 0; i < count; i++) {
    const id: string = await page.evaluate((title: string) => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      return tabs.getState().addTab(groupId, { type: 'terminal', title })
    }, `Perf ${i + 1}`)

    ids.push(id)

    // This tab is now active — wait for xterm to mount
    await page.locator('.xterm').first().waitFor({ state: 'attached', timeout: 15_000 })

    // Wait for the shell to emit at least one character (initial prompt)
    await page.waitForFunction(
      () => {
        const rows = document.querySelector('.xterm-rows')
        return rows && rows.textContent && rows.textContent.trim().length > 0
      },
      null,
      { timeout: 20_000 },
    )

    console.log(`  tab ${i + 1}/${count} ready (id=${id})`)
  }

  return ids
}

/**
 * Switch between tabs N times via the store (no measurement — for warm-up).
 */
async function switchTabsViaStore(page: Page, tabIds: string[], n: number): Promise<void> {
  await page.evaluate(
    ({ tabIds, n }: { tabIds: string[]; n: number }) => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      for (let i = 0; i < n; i++) {
        tabs.getState().setActiveTab(groupId, tabIds[i % tabIds.length])
      }
    },
    { tabIds, n },
  )
}

/**
 * Benchmark N tab switches, measuring time from store update to next rAF.
 * Returns an array of durations in milliseconds.
 */
async function measureRafSwitchLatency(
  page: Page,
  tabIds: string[],
  n: number,
): Promise<number[]> {
  return page.evaluate(
    ({ tabIds, n }: { tabIds: string[]; n: number }) => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]

      return new Promise<number[]>((resolve) => {
        const durations: number[] = []
        let i = 0

        function next() {
          if (i >= n) { resolve(durations); return }
          const targetId = tabIds[i % tabIds.length]
          const t0 = performance.now()
          tabs.getState().setActiveTab(groupId, targetId)
          requestAnimationFrame(() => {
            durations.push(performance.now() - t0)
            i++
            next()
          })
        }

        next()
      })
    },
    { tabIds, n },
  )
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

interface Metrics {
  min: number; avg: number; p50: number; p95: number; p99: number; max: number; count: number
}

function computeMetrics(durations: number[]): Metrics {
  const sorted = [...durations].sort((a, b) => a - b)
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length
  return {
    count: durations.length,
    min: sorted[0],
    avg,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)] ?? sorted[sorted.length - 1],
    max: sorted[sorted.length - 1],
  }
}

function printMetrics(label: string, m: Metrics) {
  console.log(`\n  ── ${label} (n=${m.count}) ──`)
  console.log(
    `  min=${m.min.toFixed(2)}ms  avg=${m.avg.toFixed(2)}ms  p50=${m.p50.toFixed(2)}ms` +
    `  p95=${m.p95.toFixed(2)}ms  p99=${m.p99.toFixed(2)}ms  max=${m.max.toFixed(2)}ms`,
  )
}
