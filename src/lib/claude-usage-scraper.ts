/**
 * Claude Usage Scraper
 *
 * Creates a hidden PTY session (not shown in sidebar or tabs), runs
 * `claude "/usage"`, waits for output, parses the usage data, then
 * cleans up the session. Runs on a configurable interval.
 */

import * as termAPI from './terminal-ws'
import { stripAnsi } from './terminal-detection'
import { useClaudeUsageStore } from '@/store/claude-usage'
import type { ClaudeUsageData } from '@/store/claude-usage'

/** Prefix for hidden usage-scraper session IDs */
const SESSION_PREFIX = '__claude-usage-scraper__'

/** Default scrape interval in milliseconds (5 minutes) */
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000

/** Maximum time to wait for output before giving up (30 seconds) */
const SCRAPE_TIMEOUT_MS = 30_000

/** Minimum time between scrapes to avoid overlapping (10 seconds) */
const MIN_SCRAPE_GAP_MS = 10_000

let intervalHandle: ReturnType<typeof setInterval> | null = null
let scrapeCounter = 0
let lastScrapeTime = 0

/**
 * Parse the raw output from `claude "/usage"` and extract usage data.
 *
 * Claude's /usage command outputs something like:
 *   "You've used approximately 42.5% of your daily limit."
 *   or token/cost information in various formats.
 */
export function parseUsageOutput(raw: string): Pick<ClaudeUsageData, 'percentUsed' | 'statusLine'> {
  const clean = stripAnsi(raw)

  // Look for percentage pattern: "X% of your daily limit" or similar
  const pctMatch = clean.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of\s+(?:your\s+)?(?:daily\s+)?(?:limit|quota|allowance|capacity))/i)
  let percentUsed: number | null = null
  if (pctMatch) {
    percentUsed = parseFloat(pctMatch[1])
  }

  // Extract a summary status line — look for the most informative line
  let statusLine: string | null = null

  // Try to find usage-related lines
  const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  for (const line of lines) {
    // Skip prompt lines, escape messages, and other noise
    if (/^[$>]/.test(line)) continue
    if (/esc\s+to\s+cancel/i.test(line)) continue
    if (/^claude\b/i.test(line)) continue
    if (/^\s*$/.test(line)) continue

    // Match lines that contain usage-related info
    if (/\d+(\.\d+)?\s*%/i.test(line) ||
        /token/i.test(line) ||
        /usage/i.test(line) ||
        /limit/i.test(line) ||
        /cost/i.test(line) ||
        /remaining/i.test(line) ||
        /quota/i.test(line) ||
        /allowance/i.test(line)) {
      statusLine = line
      break
    }
  }

  // Fallback: if we still have no status line, take the first substantive line
  if (!statusLine) {
    for (const line of lines) {
      if (/^[$>]/.test(line)) continue
      if (/esc\s+to\s+cancel/i.test(line)) continue
      if (/^claude\b/i.test(line)) continue
      if (line.length > 5) {
        statusLine = line
        break
      }
    }
  }

  return { percentUsed, statusLine }
}

/**
 * Run a single usage scrape. Creates a hidden PTY, runs `claude "/usage"`,
 * collects output, parses it, and cleans up.
 */
async function scrapeOnce(): Promise<void> {
  const now = Date.now()
  if (now - lastScrapeTime < MIN_SCRAPE_GAP_MS) return

  const store = useClaudeUsageStore.getState()
  if (store.scraping) return

  store.setScraping(true)
  lastScrapeTime = now

  const sessionId = `${SESSION_PREFIX}${++scrapeCounter}`
  let dataBuffer = ''
  let resolved = false

  const dataHandler = (_event: any, id: string, data: string) => {
    if (id !== sessionId) return
    dataBuffer += data
  }

  try {
    // Listen for PTY data
    termAPI.onTerminalData(dataHandler)

    // Create hidden PTY session with the usage command
    await termAPI.createTerminal(sessionId, undefined, 'claude "/usage"\n')

    // Wait for "Esc to cancel" or similar output indicating the response is ready,
    // or for enough substantive content to appear
    const result = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          // Even on timeout, use whatever we've collected
          if (dataBuffer.length > 0) {
            resolve(dataBuffer)
          } else {
            reject(new Error('Timed out waiting for Claude usage output'))
          }
        }
      }, SCRAPE_TIMEOUT_MS)

      const checkInterval = setInterval(() => {
        if (resolved) {
          clearInterval(checkInterval)
          return
        }

        const stripped = stripAnsi(dataBuffer)

        // Check for "Esc to cancel" — Claude is done outputting
        if (/esc\s+to\s+cancel/i.test(stripped)) {
          resolved = true
          clearTimeout(timeout)
          clearInterval(checkInterval)
          // Small delay to let the final output flush
          setTimeout(() => resolve(dataBuffer), 500)
          return
        }

        // Check for a percentage or token mention — usage data arrived
        if (/\d+(\.\d+)?\s*%/.test(stripped) && stripped.length > 20) {
          resolved = true
          clearTimeout(timeout)
          clearInterval(checkInterval)
          setTimeout(() => resolve(dataBuffer), 1000)
          return
        }

        // Check for process exit / error indicators
        if (/\[Process exited\]/.test(stripped) || /command not found/i.test(stripped)) {
          resolved = true
          clearTimeout(timeout)
          clearInterval(checkInterval)
          resolve(dataBuffer)
        }
      }, 300)
    })

    // Send Escape to dismiss any interactive prompt
    try {
      await termAPI.writeTerminal(sessionId, '\x1b')
      // Wait a moment, then send 'y' + Enter in case there's a confirmation
      await new Promise(r => setTimeout(r, 300))
      await termAPI.writeTerminal(sessionId, 'y')
      await new Promise(r => setTimeout(r, 100))
      await termAPI.writeTerminal(sessionId, '\r')
    } catch {
      // Terminal may already be gone
    }

    // Parse the output
    const parsed = parseUsageOutput(result)
    const usageData: ClaudeUsageData = {
      raw: stripAnsi(result),
      percentUsed: parsed.percentUsed,
      statusLine: parsed.statusLine,
      lastUpdated: Date.now(),
    }

    store.setUsage(usageData)

    // Persist to localStorage for cross-session availability
    try {
      localStorage.setItem('conductor:claude-usage', JSON.stringify(usageData))
    } catch {}

  } catch (err) {
    console.warn('[claude-usage] scrape failed:', err)
    store.setError(err instanceof Error ? err.message : 'Unknown error')
  } finally {
    // Clean up: remove listener and kill the hidden session
    termAPI.offTerminalData(dataHandler)
    try {
      await termAPI.killTerminal(sessionId)
    } catch {
      // Session may already be dead
    }
    store.setScraping(false)
  }
}

/**
 * Start the periodic usage scraper.
 * @param intervalMs How often to scrape (default: 5 minutes)
 */
export function startUsageScraper(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (intervalHandle !== null) return

  // Hydrate from localStorage on start
  try {
    const cached = localStorage.getItem('conductor:claude-usage')
    if (cached) {
      const parsed = JSON.parse(cached) as ClaudeUsageData
      // Only use cache if less than 10 minutes old
      if (Date.now() - parsed.lastUpdated < 10 * 60 * 1000) {
        useClaudeUsageStore.getState().setUsage(parsed)
      }
    }
  } catch {}

  // Initial scrape after a short delay (let the app finish loading)
  setTimeout(() => {
    scrapeOnce().catch(console.warn)
  }, 5_000)

  // Periodic scraping
  intervalHandle = setInterval(() => {
    scrapeOnce().catch(console.warn)
  }, intervalMs)
}

/**
 * Stop the periodic usage scraper.
 */
export function stopUsageScraper(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}

/**
 * Trigger an immediate scrape (e.g. from a "refresh" button).
 */
export function scrapeNow(): void {
  lastScrapeTime = 0 // Reset gap timer
  scrapeOnce().catch(console.warn)
}
