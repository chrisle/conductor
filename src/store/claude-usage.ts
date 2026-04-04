import { create } from 'zustand'

export interface ClaudeUsageData {
  /** Raw text output from `claude "/usage"` */
  raw: string
  /** Percentage of daily limit used (e.g. 42.5) */
  percentUsed: number | null
  /** Human-readable status line (e.g. "42.5% of your daily limit") */
  statusLine: string | null
  /** Timestamp of last successful scrape */
  lastUpdated: number
}

interface ClaudeUsageState {
  usage: ClaudeUsageData | null
  /** Whether a scrape is currently in progress */
  scraping: boolean
  /** Error message from last failed scrape attempt */
  error: string | null

  setUsage: (data: ClaudeUsageData) => void
  setScraping: (scraping: boolean) => void
  setError: (error: string | null) => void
  clear: () => void
}

export const useClaudeUsageStore = create<ClaudeUsageState>((set) => ({
  usage: null,
  scraping: false,
  error: null,

  setUsage: (data) => set({ usage: data, error: null }),
  setScraping: (scraping) => set({ scraping }),
  setError: (error) => set({ error }),
  clear: () => set({ usage: null, scraping: false, error: null }),
}))
