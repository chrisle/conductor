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

// Detect Claude spinner characters (shown while thinking).
// These are the animation frames from Claude Code's spinner, minus ✻.
const SPINNER_RE = /[·✢✳✶✽*]/

// Detect Claude finished — any past-tense verb ("…ed for …Xs") completion line
const DONE_RE = /ed\s+for\b.*\d+s/i

export interface ThinkingState {
  thinking: boolean
  /** Elapsed time string, e.g. "4m 35s" or "53s". Only set when thinking. */
  time?: string
  /** True when a completion message ("Cooked for…") was detected — clears immediately. */
  done?: boolean
}

export function getThinkingState(screenText: string, latestChunk?: string): ThinkingState {
  const stripped = stripAnsi(screenText)
  if (DONE_RE.test(stripped)) return { thinking: false, done: true }
  // Use the last match so same-line rewrites return the most recent time value
  const globalRe = new RegExp(THINKING_RE.source, THINKING_RE.flags + 'g')
  let lastMatch: RegExpExecArray | null = null
  let m: RegExpExecArray | null
  while ((m = globalRe.exec(stripped)) !== null) lastMatch = m
  if (lastMatch) {
    const time = lastMatch[1] ? `${lastMatch[1]} ${lastMatch[2]}` : lastMatch[2]
    return { thinking: true, time }
  }
  // Check for a spinner character in the latest PTY chunk (preferred) or
  // the last non-empty line. The spinner is a single char that gets
  // overwritten in-place, so it's most reliably caught in the raw chunk
  // before it gets buried by cursor movement sequences in the buffer.
  const toCheck = latestChunk !== undefined ? stripAnsi(latestChunk) : stripped
  const lines = toCheck.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.length === 0) continue
    if (line.length <= 2 && SPINNER_RE.test(line)) return { thinking: true }
    break
  }
  return { thinking: false }
}

export function isThinking(screenText: string): boolean {
  return getThinkingState(screenText).thinking
}

