import { useCallback } from 'react'
import { useThinkingDetect } from './index'

/**
 * Composes all onPtyData handlers for a Claude tab into a single callback.
 * Add new handlers to pty-handlers/ and wire them in here.
 *
 * Note: autopilot (auto-responding to yes/no prompts) is handled by conductord
 * so it works even when the tab is closed.
 */
export function usePtyHandlers(
  tabId: string,
  groupId: string,
): (data: string) => void {
  const thinkingDetect = useThinkingDetect(tabId, groupId)

  const onPtyData = useCallback((data: string) => {
    thinkingDetect(data)
  }, [thinkingDetect])

  return onPtyData
}
