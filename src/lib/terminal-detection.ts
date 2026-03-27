/**
 * Pure functions extracted from TerminalTab for detecting Claude thinking state
 * and matching autopilot rules against terminal screen text.
 */

export const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b[()][AB012]|\r/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

// Detect Claude actively working: a timer + token counter in parentheses.
// Matches all observed formats:
//   "(4m 35s · ↑ 611 tokens)"
//   "(6m 1s · ↑ 4.8k tokens · thinking with medium effort)"
//   "(53s · ↓ 778 tokens)"   ← seconds-only, down-arrow variant
const THINKING_RE = /\((?:(\d+m)\s+)?(\d+s)\s*·\s*[↑↓]\s*[\d.]+[kmb]?\s+tokens/i

// Detect Claude finished — "Cooked for 8m 57s" means it's done, not thinking.
const DONE_RE = /cooked\s+for\b/i

export interface ThinkingState {
  thinking: boolean
  /** Elapsed time string, e.g. "4m 35s" or "53s". Only set when thinking. */
  time?: string
  /** True when a completion message ("Cooked for…") was detected — clears immediately. */
  done?: boolean
}

export function getThinkingState(screenText: string): ThinkingState {
  const stripped = stripAnsi(screenText)
  if (DONE_RE.test(stripped)) return { thinking: false, done: true }
  const match = THINKING_RE.exec(stripped)
  if (!match) return { thinking: false }
  const time = match[1] ? `${match[1]} ${match[2]}` : match[2]
  return { thinking: true, time }
}

export function isThinking(screenText: string): boolean {
  return getThinkingState(screenText).thinking
}

