import { useCallback, useEffect, useRef } from 'react'
import { stripAnsi } from '@/lib/terminal-detection'
import { useClaudeSettings } from '../contexts/useClaudeSettings'

export function matchPrompt(text: string): string | null {
  if (/1\.?\s*Yes/s.test(text))              return '\r'
  if (/\(Y\/n\)\s*$/im.test(text))           return 'y\r'
  if (/\(y\/N\)\s*$/im.test(text))           return 'y\r'
  if (/\[y\/n\]\s*$/im.test(text))           return 'y\r'
  if (/\[Y\/n\]\s*$/im.test(text))           return 'y\r'
  if (/confirm\? \(y\/n\)/i.test(text))      return 'y\r'
  if (/press enter to continue/i.test(text)) return '\r'
  if (/continue\? \[y\/n\]/i.test(text))     return 'y\r'
  if (/Allow.*\(y\/n\)/i.test(text))         return 'y\r'
  return null
}

/**
 * Watches raw PTY data and auto-responds to Claude Code yes/no prompts.
 */
export function useAnswerYes(
  enabled: boolean,
  write: ((data: string) => void) | null,
) {
  const { autoPilotScanMs } = useClaudeSettings()
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
