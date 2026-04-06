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
import type { ClaudeUsageData, UsageTier } from '@/store/claude-usage'

/** Prefix for hidden usage-scraper session IDs */
const SESSION_PREFIX = '__claude-usage-scraper__'

/** Default scrape interval in milliseconds (15 minutes) */
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000

/** Maximum time to wait for output before giving up (30 seconds) */
const SCRAPE_TIMEOUT_MS = 30_000

/** Minimum time between scrapes (matches the default interval) */
const MIN_SCRAPE_GAP_MS = DEFAULT_INTERVAL_MS

let intervalHandle: ReturnType<typeof setInterval> | null = null
let scrapeCounter = 0
let lastScrapeTime = 0

/**
 * Parse a reset string like "Resets Apr 10 at 7am" into an ISO timestamp.
 * Assumes the reset is in the near future (within ~30 days).
 */
export function parseResetToISO(resetStr: string): string | null {
  // Match patterns: "Resets Apr 10 at 7am", "Resets May 1", "Resets 9:00pm"
  const dateTimeMatch = resetStr.match(/Resets\s+([A-Z][a-z]+)\s+(\d+)\s+at\s+(\d+)(?::(\d+))?\s*(am|pm)/i)
  const dateOnlyMatch = resetStr.match(/Resets\s+([A-Z][a-z]+)\s+(\d+)/i)
  const timeOnlyMatch = resetStr.match(/Resets\s+(?:at\s+)?(\d+)(?::(\d+))?\s*(am|pm)/i)

  const now = new Date()

  if (dateTimeMatch) {
    const [, monthStr, dayStr, hourStr, minStr, ampm] = dateTimeMatch
    return buildResetDate(now, monthStr, parseInt(dayStr, 10), hourStr, minStr || '0', ampm)
  }

  if (dateOnlyMatch && !dateTimeMatch) {
    const [, monthStr, dayStr] = dateOnlyMatch
    // Default to midnight when no time specified
    return buildResetDate(now, monthStr, parseInt(dayStr, 10), '12', '0', 'am')
  }

  if (timeOnlyMatch && !dateOnlyMatch) {
    const [, hourStr, minStr, ampm] = timeOnlyMatch
    // Time-only means today or tomorrow
    let hour = parseInt(hourStr, 10)
    if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12
    if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0
    const candidate = new Date(now)
    candidate.setHours(hour, parseInt(minStr || '0', 10), 0, 0)
    // If the time already passed today, it means tomorrow
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1)
    return candidate.toISOString()
  }

  return null
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

function buildResetDate(now: Date, monthStr: string, day: number, hourStr: string, minStr: string, ampm: string): string {
  const month = MONTH_MAP[monthStr.toLowerCase().slice(0, 3)]
  if (month === undefined) return now.toISOString()

  let hour = parseInt(hourStr, 10)
  if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12
  if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0

  const candidate = new Date(now.getFullYear(), month, day, hour, parseInt(minStr, 10), 0, 0)
  // If date is in the past, assume next year
  if (candidate < now) candidate.setFullYear(candidate.getFullYear() + 1)
  return candidate.toISOString()
}

/**
 * Format a reset ISO timestamp as a relative countdown string.
 * Returns e.g. "Resets in 2h", "Resets in 3d", or the original string as fallback.
 */
export function formatResetCountdown(resetsAt: string | null, fallback: string | null): string | null {
  if (!resetsAt) return fallback
  const now = Date.now()
  const target = new Date(resetsAt).getTime()
  const diffMs = target - now
  if (diffMs <= 0) return fallback

  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Resets in <1m'
  if (diffMin < 60) return `Resets in ${diffMin}m`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `Resets in ${diffHrs}h`
  const diffDays = Math.floor(diffHrs / 24)
  return `Resets in ${diffDays}d`
}

/**
 * Pick the best reset countdown string from a list of usage tiers.
 * Prefers the "all models" tier (weekly cap), falls back to the first tier with reset info.
 */
export function getPrimaryResetCountdown(tiers: UsageTier[] | undefined): string | null {
  if (!tiers || tiers.length === 0) return null
  const primaryTier = tiers.find(t => /all models/i.test(t.label) && t.resetsAt)
    ?? tiers.find(t => t.resetsAt)
  if (!primaryTier) return null
  return formatResetCountdown(primaryTier.resetsAt, primaryTier.resets)
}

/**
 * Parse the raw output from `claude "/usage"`.
 *
 * Example output:
 *   Current week (all models) ██████▌ 13% used Resets Apr 10 at 7am (America/Los_Angeles)
 *   Current week (Sonnet only) ██ 4% used Resets Apr 11 at 11:59am (America/Los_Angeles)
 *   Extra usage █ 1% used $1.96 / $100.00 spent · Resets May 1 (America/Los_Angeles)
 */
export function parseUsageOutput(raw: string): Pick<ClaudeUsageData, 'percentUsed' | 'sessionPercent' | 'tiers'> {
  const clean = stripAnsi(raw)

  // Extract "all models" percentage for the color indicator
  const allModelsMatch = clean.match(/all\s+models\)[\s\S]*?(\d+(?:\.\d+)?)\s*%\s*used/i)
  const anyPctMatch = clean.match(/(\d+(?:\.\d+)?)\s*%\s*used/i)
  const percentUsed = allModelsMatch
    ? parseFloat(allModelsMatch[1])
    : anyPctMatch
      ? parseFloat(anyPctMatch[1])
      : null

  // Extract "Current session" percentage for the footer label
  const sessionMatch = clean.match(/Current\s+session[\s\S]*?(\d+(?:\.\d+)?)\s*%\s*used/i)
  const sessionPercent = sessionMatch ? parseFloat(sessionMatch[1]) : null

  // Parse each usage tier with details
  const tiers: UsageTier[] = []
  // Match tier headers followed by their content up to the next tier or end
  const tierPattern = /(Current session|Current week \(([^)]+)\)|Extra usage)([\s\S]*?)(?=Current session|Current week|Extra usage|Esc to cancel|$)/gi
  let m
  while ((m = tierPattern.exec(clean)) !== null) {
    const fullLabel = m[1]
    const subLabel = m[2] // e.g. "all models" or "Sonnet only"
    const content = m[3]

    const label = subLabel
      ? subLabel.charAt(0).toUpperCase() + subLabel.slice(1)
      : /Current session/i.test(fullLabel)
        ? 'Session'
        : 'Extra usage'

    const pctMatch = content.match(/(\d+(?:\.\d+)?)\s*%\s*used/i)
    if (!pctMatch) continue
    const percent = parseFloat(pctMatch[1])

    // Extract reset info: "Resets Apr 10 at 7am" or "Resets at 9:00 PM" (stop before timezone parens)
    const resetMatch = content.match(/Resets\s+([A-Z][a-z]+\s+\d+(?:\s+at\s+\d+(?::\d+)?(?:am|pm)?)?)/i)
      || content.match(/Resets\s+(?:at\s+)?(\d+(?::\d+)?\s*(?:am|pm))/i)
    const resets = resetMatch ? `Resets ${resetMatch[1]}` : null
    const resetsAt = resets ? parseResetToISO(resets) : null

    // Extract dollar amounts for extra usage: "$1.96 / $100.00 spent"
    const spentMatch = content.match(/(\$[\d.]+\s*\/\s*\$[\d.]+)\s*spent/i)
    const spent = spentMatch ? spentMatch[1] + ' spent' : null

    tiers.push({ label, percent, resets, resetsAt, spent })
  }

  return { percentUsed, sessionPercent, tiers }
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

    // Enable autopilot so conductord auto-accepts any permission prompts
    termAPI.setAutoPilot(sessionId, true)

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

        // Check for usage data: require both a percentage AND a "Resets" line
        // to be present before resolving. Without this, the scraper can fire
        // on the first "13% used" chunk before the reset info has arrived.
        if (/\d+(\.\d+)?\s*%\s*used/i.test(stripped) && /Resets\s/i.test(stripped)) {
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
      sessionPercent: parsed.sessionPercent,
      tiers: parsed.tiers,
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
      // Discard stale cache from old schema (missing tiers)
      if (parsed.tiers) {
        useClaudeUsageStore.getState().setUsage(parsed)
        lastScrapeTime = parsed.lastUpdated
      } else {
        localStorage.removeItem('conductor:claude-usage')
      }
    }
  } catch {}

  // Initial scrape after a short delay (let the app finish loading).
  // scrapeOnce() will no-op if lastScrapeTime is recent enough.
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
