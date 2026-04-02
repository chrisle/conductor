import { useCallback, useEffect, useRef } from 'react'
import { stripAnsi } from '@/lib/terminal-detection'

// ---------------------------------------------------------------------------
// Two-tier prompt detection (inspired by claude-yolo / codex-yolo)
//
// Menu-style prompts (numbered / cursor menus) require THREE signals:
//   1. A "Yes" option visible  (primary)
//   2. A "No" option visible   (primary)
//   3. A contextual keyword    (secondary — tool name, permission phrase, etc.)
//
// Text-style y/n prompts ("(Y/n)", "[y/n]") are specific enough on their own.
//
// A slash-command autocomplete picker vetoes all matches.
// Only the last 25 terminal lines are scanned.
// ---------------------------------------------------------------------------

/** Menu-style Yes: "1. Yes", "❯ Yes", "> Yes", "Yes  Allow once", etc. */
const YES_OPTION_RE = /1\.?\s*Yes|[❯>]\s+Yes\b|Yes\s+(Allow once|and don't ask)/i

/** Menu-style No: "2. No", "3. No", any numbered "No", "Deny", "No, exit", "Decline", "No, and tell", "Cancel this" */
const NO_OPTION_RE = /\d+\.?\s*No\b|[❯>]\s+No\b|\bDeny\b|No,?\s+exit|\bDecline\b|No,\s+and\s+tell|Go back without|Cancel this/i

/** Secondary context signal — at least one must accompany a menu prompt. */
const SECONDARY_RE = new RegExp(
  // Tool names (Claude Code / Codex)
  '\\bBash\\b|\\bRead\\b|\\bWrite\\b|\\bEdit\\b|\\bWebFetch\\b|\\bWebSearch\\b|\\bGrep\\b|\\bGlob\\b|\\bNotebookEdit\\b|' +
  // Action keywords
  '\\bexecute\\b|' +
  // Claude Code context
  'Do you want|want to proceed|wants to (?:execute|run)|' +
  '\\bpermission\\b|allow (?:once|always)|' +
  'trust this (?:folder|project)|safety check|' +
  'requires confirmation|Do you trust|created or one you trust|' +
  // Codex context
  'Would you like to|Allow Codex to|Approve app tool call|' +
  'may have side effects|Enable full access|just this once|Run the tool|Decline this',
  'i',
)

/** Slash-command autocomplete line: "/command-name    Description" */
const SLASH_PICKER_RE = /^\s*\/\S+\s{2,}\S/

export function matchPrompt(text: string): string | null {
  // Only scan the last 25 lines to avoid false positives from old output
  const lines = text.split('\n')
  const recent = lines.slice(-25)
  const recentText = recent.join('\n')

  // Veto: slash command autocomplete picker is open
  let slashCount = 0
  for (const line of recent) {
    if (SLASH_PICKER_RE.test(line)) slashCount++
  }
  if (slashCount >= 2) return null

  // --- Menu-style prompts (send Enter) ---
  // Two-tier: Yes option + No option + secondary context signal
  if (YES_OPTION_RE.test(recentText) && NO_OPTION_RE.test(recentText) && SECONDARY_RE.test(recentText)) {
    return '\r'
  }

  // --- Text-style y/n prompts (specific patterns, lower false-positive risk) ---
  if (/\(Y\/n\)\s*$/im.test(recentText))           return 'y\r'
  if (/\(y\/N\)\s*$/im.test(recentText))           return 'y\r'
  if (/\[y\/n\]\s*$/im.test(recentText))           return 'y\r'
  if (/\[Y\/n\]\s*$/im.test(recentText))           return 'y\r'
  if (/confirm\? \(y\/n\)/i.test(recentText))      return 'y\r'
  if (/press enter to continue/i.test(recentText)) return '\r'
  if (/continue\? \[y\/n\]/i.test(recentText))     return 'y\r'
  if (/Allow.*\(y\/n\)/i.test(recentText))         return 'y\r'
  if (/proceed\?\s*\(y\/n\)/i.test(recentText))    return 'y\r'
  return null
}

/**
 * Watches raw PTY data and auto-responds to yes/no prompts.
 */
export function useAnswerYes(
  enabled: boolean,
  write: ((data: string) => void) | null,
  autoPilotScanMs: number,
) {
  const enabledRef = useRef(enabled)
  const recentDataRef = useRef('')
  const lastResponseTimeRef = useRef(0)
  const scanMsRef = useRef(autoPilotScanMs)

  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => { scanMsRef.current = autoPilotScanMs }, [autoPilotScanMs])

  const onPtyData = useCallback((data: string) => {
    if (!enabledRef.current) return

    recentDataRef.current += data
    if (recentDataRef.current.length > 4096) {
      recentDataRef.current = recentDataRef.current.slice(-4096)
    }

    const now = Date.now()
    if (now - lastResponseTimeRef.current < scanMsRef.current) return

    const response = matchPrompt(stripAnsi(recentDataRef.current))
    if (!response) return

    lastResponseTimeRef.current = now
    recentDataRef.current = ''
    setTimeout(() => { write?.(response) }, 150)
  }, [write])

  return onPtyData
}
