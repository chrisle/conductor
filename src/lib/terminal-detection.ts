/**
 * Pure functions extracted from TerminalTab for detecting Claude thinking state
 * and matching autopilot rules against terminal screen text.
 */

export const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b[()][AB012]|\r/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

// Regex to detect Claude "thinking" status lines: e.g. "✳ Zigzagging… (4m 35s · ↓ 611 tokens)"
const THINKING_RE = /…\s*\(/

export function isThinking(screenText: string): boolean {
  return THINKING_RE.test(stripAnsi(screenText))
}

export interface AutopilotRule {
  pattern: RegExp
  response: string
}

export const AUTOPILOT_RULES: AutopilotRule[] = [
  // Claude Code interactive menus — any question followed by numbered options
  // where option 1 is "Yes". Must come FIRST: these menus only accept Enter/arrows,
  // sending "y" would be ignored and poison the dedup cache.
  // Covers: file creation, workspace trust, bash permission, etc.
  { pattern: /\?.*1\.\s*Yes/s, response: '\r' },

  // Simple y/n prompts (text-based, not numbered menus)
  { pattern: /\(Y\/n\)\s*$/i, response: 'y\r' },
  { pattern: /\(y\/N\)\s*$/i, response: 'y\r' },
  { pattern: /\[y\/n\]\s*$/i, response: 'y\r' },
  { pattern: /\[Y\/n\]\s*$/i, response: 'y\r' },
  { pattern: /confirm\? \(y\/n\)/i, response: 'y\r' },
  { pattern: /press enter to continue/i, response: '\r' },
  { pattern: /continue\? \[y\/n\]/i, response: 'y\r' },
  { pattern: /Do you want to proceed/i, response: 'y\r' },
  { pattern: /Allow.*\(y\/n\)/i, response: 'y\r' },
]

/**
 * Finds the first autopilot rule matching the given screen text.
 * Returns the rule if found, or null if no match.
 */
export function matchAutopilotRule(screenText: string): AutopilotRule | null {
  for (const rule of AUTOPILOT_RULES) {
    if (rule.pattern.test(screenText)) {
      return rule
    }
  }
  return null
}
