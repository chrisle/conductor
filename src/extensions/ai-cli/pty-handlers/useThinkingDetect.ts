import { useCallback, useRef } from 'react'
import { getThinkingState, stripAnsi } from '@/lib/terminal-detection'
import { useTabsStore } from '@/store/tabs'

/**
 * Watches raw PTY data and updates the tab's `isThinking` flag in the store
 * whenever Claude transitions between thinking and idle.
 *
 * Transitions to "thinking" are immediate. Transitions to "not thinking" are
 * debounced (800 ms) so that brief gaps caused by cursor rewrites or large tool
 * responses don't produce visible flicker. The spinner gives us a reliable
 * frame-by-frame signal (~200ms apart) so a short debounce is sufficient.
 */
export function useThinkingDetect(tabId: string, groupId: string) {
  const { updateTab } = useTabsStore()
  const recentDataRef = useRef('')
  const thinkingRef = useRef(false)
  const offTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onPtyData = useCallback((data: string) => {
    recentDataRef.current += data
    if (recentDataRef.current.length > 4096) {
      recentDataRef.current = recentDataRef.current.slice(-4096)
    }

    // Check only the recent tail for done detection to avoid stale matches.
    // The thinking pattern (timer + tokens) also uses the tail so old
    // thinking lines that scrolled off don't produce false positives.
    const tail = recentDataRef.current.slice(-1024)
    const { thinking, time, done } = getThinkingState(stripAnsi(tail), data)

    if (thinking) {
      // Cancel any pending "not thinking" timer and go green immediately
      if (offTimerRef.current) {
        clearTimeout(offTimerRef.current)
        offTimerRef.current = null
      }
      if (!thinkingRef.current || time) {
        thinkingRef.current = true
        updateTab(groupId, tabId, { isThinking: true, thinkingTime: time })
      }
    } else if (done && thinkingRef.current) {
      // "Cooked for…" seen — clear immediately, no debounce
      if (offTimerRef.current) {
        clearTimeout(offTimerRef.current)
        offTimerRef.current = null
      }
      thinkingRef.current = false
      // Clear the buffer so the done message doesn't block future detection
      recentDataRef.current = ''
      updateTab(groupId, tabId, { isThinking: false, thinkingTime: undefined })
    } else if (thinkingRef.current) {
      // Reset the debounce timer on every data arrival — same-line overwrites
      // keep sending data without matching THINKING_RE, so we must extend the
      // grace period on each chunk rather than setting the timer only once.
      if (offTimerRef.current) clearTimeout(offTimerRef.current)
      offTimerRef.current = setTimeout(() => {
        offTimerRef.current = null
        thinkingRef.current = false
        recentDataRef.current = ''
        updateTab(groupId, tabId, { isThinking: false, thinkingTime: undefined })
      }, 800)
    }
  }, [tabId, groupId, updateTab])

  return onPtyData
}
