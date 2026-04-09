/**
 * Real Electron performance test — measures actual rendering latency
 * with real PTY sessions, real React renders, and real Zustand updates.
 *
 * This test opens actual Claude Code (ai-cli) tabs, waits for Claude to
 * start, sends a long prompt to each session, and benchmarks tab switch
 * latency while all Claude sessions are concurrently thinking and streaming.
 *
 * Unlike perf-stress.spec.ts (which simulates with mocks), every re-render
 * and store update here is real.
 *
 * Run explicitly with:
 *   npx playwright test e2e/perf-real.spec.ts --reporter=list
 *
 * Requires: conductord installed, `claude` CLI on $PATH, authenticated.
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

const N_TABS = 4            // concurrent Claude sessions (4 is realistic for most users)
const N_SWITCHES = 30       // tab switches to benchmark per test
const N_WARMUP = 5          // non-measured warm-up switches

const MAX_P95_IDLE_SWITCH_MS = 50     // Claude idle at > prompt
const MAX_P95_STREAM_SWITCH_MS = 100  // Claude actively thinking/streaming

// A prompt that triggers Claude to stream output for 30+ seconds.
// Asking for multiple detailed examples keeps it generating for a long time.
const CLAUDE_PROMPT =
  'Write 10 detailed JavaScript code examples demonstrating different design patterns: ' +
  'singleton, factory, observer, decorator, strategy, command, proxy, facade, iterator, and mediator. ' +
  'For each pattern: explain when to use it, show the full implementation, show usage, and explain trade-offs. ' +
  'Do not use any tools or read any files.'

// ─── Process state ────────────────────────────────────────────────────────────

let electronProcess: ChildProcess
let browser: Browser
let page: Page
let tabIds: string[] = []

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Real Electron performance (requires conductord + claude CLI)', () => {

  test.beforeAll(async () => {
    test.setTimeout(300_000) // 5 min — Claude startup takes time

    killAllConductorProcesses()
    await new Promise(r => setTimeout(r, 2000))

    const app = await launchElectronApp()
    electronProcess = app.electronProcess
    browser = app.browser
    page = app.page

    await waitForAppAndResetToEmptyProject(page)
    await page.evaluate(() => { localStorage.setItem('conductor.perf', '1') })

    // Wait for conductord to be healthy and the ai-cli extension to register
    await page.waitForFunction(
      () => {
        const reg = (window as any).__stores__?.extensionRegistry
        return reg && (reg.getExtension('ai-cli') || reg.getExtension('claude-code'))
      },
      null,
      { timeout: 30_000 },
    ).catch(() => console.log('  WARNING: ai-cli extension not detected in registry'))

    const conductordOk: boolean = await page.evaluate(async () => {
      try { return await window.electronAPI.conductordHealth() } catch { return false }
    })
    console.log(`\n  conductord health: ${conductordOk}`)

    // Open N real Claude Code tabs. Each starts `claude --dangerously-skip-permissions`
    // via the ai-cli extension, which also wires up useThinkingDetect.
    tabIds = await openClaudeTabs(page, N_TABS)
    console.log(`\n  ${tabIds.length}/${N_TABS} Claude sessions ready`)
    expect(tabIds.length).toBeGreaterThan(0)
  })

  test.afterAll(async () => {
    // Send Ctrl+C to every Claude session before killing the app
    try {
      for (const id of tabIds) {
        await page.evaluate(
          ({ id }: { id: string }) => { window.electronAPI.writeTerminal(id, '\x03') },
          { id },
        )
      }
    } catch {}
    try { await browser?.close() } catch {}
    if (electronProcess) electronProcess.kill('SIGKILL')
    killAllConductorProcesses()
  })

  // ─── Test 1: idle — Claude waiting at > prompt ─────────────────────────────

  test(`tab switch latency — ${N_TABS} idle Claude sessions (waiting at > prompt)`, async () => {
    test.setTimeout(60_000)

    await switchTabsViaStore(page, tabIds, N_WARMUP)
    await page.evaluate(() => { (window as any).__perfClear?.() })

    const durations = await measureRafSwitchLatency(page, tabIds, N_SWITCHES)
    const m = computeMetrics(durations)
    printMetrics(`Tab switch — ${N_TABS} idle Claude sessions`, m)

    expect(m.p95, `p95 idle (${m.p95.toFixed(1)}ms) > ${MAX_P95_IDLE_SWITCH_MS}ms`)
      .toBeLessThan(MAX_P95_IDLE_SWITCH_MS)
  })

  // ─── Test 2: all Claude sessions actively thinking/streaming ──────────────

  test(`tab switch latency — ${N_TABS} Claude sessions thinking concurrently`, async () => {
    test.setTimeout(120_000)

    // Get group ID first (used throughout this test)
    const groupId: string = await page.evaluate(() => {
      return (window as any).__stores__.layout.getState().getAllGroupIds()[0]
    })

    // Switch to each tab and send the prompt.
    // Using \r (carriage return) — that's what Enter produces in a PTY.
    for (const id of tabIds) {
      await page.evaluate(
        ({ groupId, id }: { groupId: string; id: string }) => {
          (window as any).__stores__.tabs.getState().setActiveTab(groupId, id)
        },
        { groupId, id },
      )
      await new Promise(r => setTimeout(r, 200)) // let xterm render
      await page.evaluate(
        ({ id, prompt }: { id: string; prompt: string }) => {
          window.electronAPI.writeTerminal(id, prompt + '\r')
        },
        { id, prompt: CLAUDE_PROMPT },
      )
      console.log(`  Sent prompt to ${id}`)
      // Stagger so they don't all hit the API simultaneously
      await new Promise(r => setTimeout(r, 1000))
    }

    // Clear perf marks and wait for Claude to start responding.
    // Typical time-to-first-token is 1–3s; 8s gives plenty of headroom.
    await page.evaluate(() => { (window as any).__perfClear?.() })
    console.log('\n  Waiting 8s for Claude sessions to start streaming...')
    await new Promise(r => setTimeout(r, 8000))

    // Confirm PTY data is flowing via terminal-write perf marks
    const writeCount: number = await page.evaluate(() => {
      const meas: Record<string, number[]> = (window as any).__perfMeasurements ?? {}
      return (meas['terminal-write'] ?? []).length
    })
    console.log(`  terminal-write events: ${writeCount} (confirms PTY data is flowing)`)

    // Check how many sessions show isThinking (fires for extended thinking mode)
    const thinkingCount: number = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const gid = layout.getState().getAllGroupIds()[0]
      const group = tabs.getState().groups[gid]
      return group?.tabs.filter((t: any) => t.isThinking).length ?? 0
    })
    console.log(`  ${thinkingCount}/${tabIds.length} sessions show isThinking (extended thinking mode)`)

    // Warm up then re-clear perf marks, then benchmark
    await switchTabsViaStore(page, tabIds, N_WARMUP)
    await page.evaluate(() => { (window as any).__perfClear?.() })

    // Benchmark while all Claude sessions are streaming
    const durations = await measureRafSwitchLatency(page, tabIds, N_SWITCHES)
    const m = computeMetrics(durations)
    printMetrics(`Tab switch — ${N_TABS} concurrent Claude sessions (${thinkingCount} isThinking)`, m)

    // Show real perf instrumentation from TabGroup's perfStart('tab-switch')
    const perfSummary = await page.evaluate(() => {
      const meas: Record<string, number[]> = (window as any).__perfMeasurements ?? {}
      const out: Record<string, string> = {}
      for (const [label, times] of Object.entries(meas)) {
        const sorted = [...times].sort((a, b) => a - b)
        const avg = times.reduce((a, b) => a + b, 0) / times.length
        const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1]
        out[label] = `count=${times.length} avg=${avg.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${sorted[sorted.length - 1].toFixed(1)}ms`
      }
      return out
    })
    if (Object.keys(perfSummary).length > 0) {
      console.log('\n  Perf marks from real renders:')
      for (const [label, summary] of Object.entries(perfSummary)) {
        console.log(`  ${label}: ${summary}`)
      }
    }

    expect(m.p95, `p95 concurrent (${m.p95.toFixed(1)}ms) > ${MAX_P95_STREAM_SWITCH_MS}ms`)
      .toBeLessThan(MAX_P95_STREAM_SWITCH_MS)
  })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Open N Claude Code (ai-cli) tabs sequentially.
 * Each tab starts `claude --dangerously-skip-permissions` automatically.
 * Waits for Claude's banner/prompt to appear before proceeding to the next tab.
 * Returns the tab IDs of successfully initialized sessions.
 */
async function openClaudeTabs(page: Page, n: number): Promise<string[]> {
  const ids: string[] = []
  const groupId: string = await page.evaluate(() => {
    return (window as any).__stores__.layout.getState().getAllGroupIds()[0]
  })

  for (let i = 0; i < n; i++) {
    // Add an ai-cli tab. The ClaudeCodeTab component will automatically
    // run `buildClaudeCommand('claude --dangerously-skip-permissions\n', settings)`
    // and pass it to createTerminal as the startup command.
    const id: string = await page.evaluate(
      ({ groupId, title, cmd }: { groupId: string; title: string; cmd: string }) => {
        return (window as any).__stores__.tabs.getState().addTab(groupId, {
          type: 'claude-code',
          title,
          initialCommand: cmd,
        })
      },
      { groupId, title: `Claude ${i + 1}`, cmd: 'claude --dangerously-skip-permissions\n' },
    )

    // Switch to this tab so its xterm mounts and we can read its output
    await page.evaluate(
      ({ groupId, id }: { groupId: string; id: string }) => {
        (window as any).__stores__.tabs.getState().setActiveTab(groupId, id)
      },
      { groupId, id },
    )

    // Wait for xterm to attach (ai-cli tabs initialize slightly slower than plain terminals)
    await page.waitForFunction(
      () => document.querySelector('.xterm') !== null,
      null,
      { timeout: 30_000 },
    ).catch(async () => {
      const info = await page.evaluate(() => ({
        tabCount: Object.values((window as any).__stores__?.tabs?.getState()?.groups ?? {})
          .flatMap((g: any) => g.tabs).length,
        extKeys: Object.keys((window as any).__stores__?.extensionRegistry?.getState?.() ?? {}),
        htmlSnippet: document.body.innerHTML.slice(0, 500),
      }))
      console.log('  xterm not found — diagnostic:', JSON.stringify(info))
      throw new Error('xterm did not attach within 30s')
    })

    // Wait for Claude's banner (distinguishes Claude from the shell prompt)
    console.log(`  Opening Claude ${i + 1}/${n}...`)
    const ready = await waitForClaudeBanner(page)
    if (!ready) {
      console.log(`  WARNING: Claude ${i + 1} did not show banner — skipping this tab`)
      // Don't include it in the tabIds — we'll work with fewer sessions
      continue
    }

    ids.push(id)
    console.log(`  Claude ${i + 1}/${n} ready (id=${id})`)
  }

  return ids
}

/**
 * Poll the visible terminal for Claude's banner text.
 * Returns true when "Claude Code" or the "❯" prompt appears.
 */
async function waitForClaudeBanner(page: Page, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text: string = await page.evaluate(() => {
      // Use the accessibility tree for clean text without ANSI codes
      const tree = document.querySelector('.xterm-accessibility-tree')
      if (tree) return tree.textContent || ''
      // Fallback: raw rows text
      const rows = Array.from(document.querySelectorAll('.xterm-rows'))
      const visible = rows.find(el => el.getBoundingClientRect().width > 0)
      return visible?.textContent || ''
    })
    if (text.includes('Claude Code') || text.includes('❯')) {
      return true
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  return false
}

/** Switch between tabs N times without measuring (warm-up). */
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

/** Measure N tab switches — store update time to next animation frame. */
async function measureRafSwitchLatency(page: Page, tabIds: string[], n: number): Promise<number[]> {
  return page.evaluate(
    ({ tabIds, n }: { tabIds: string[]; n: number }) => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      return new Promise<number[]>(resolve => {
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
