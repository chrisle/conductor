import { useCallback, useEffect, useRef } from 'react'
import { stripAnsi } from '@/lib/terminal-detection'

export function matchPrompt(text: string): string | null {
  // Legacy numbered menu: "1. Yes"
  if (/1\.?\s*Yes/s.test(text))              return '\r'
  // Claude Code v2+ cursor menu: "❯ Yes" or "> Yes"
  if (/[❯>]\s+Yes\b/.test(text))            return '\r'
  // Claude Code permission menu: "Yes  Allow once" or "Yes, and don't ask"
  if (/Yes\s+(Allow once|and don't ask)/i.test(text)) return '\r'
  // Generic yes/no prompts
  if (/\(Y\/n\)\s*$/im.test(text))           return 'y\r'
  if (/\(y\/N\)\s*$/im.test(text))           return 'y\r'
  if (/\[y\/n\]\s*$/im.test(text))           return 'y\r'
  if (/\[Y\/n\]\s*$/im.test(text))           return 'y\r'
  if (/confirm\? \(y\/n\)/i.test(text))      return 'y\r'
  if (/press enter to continue/i.test(text)) return '\r'
  if (/continue\? \[y\/n\]/i.test(text))     return 'y\r'
  if (/Allow.*\(y\/n\)/i.test(text))         return 'y\r'
  if (/proceed\?\s*\(y\/n\)/i.test(text))    return 'y\r'
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
