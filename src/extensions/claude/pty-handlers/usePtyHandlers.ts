import { useCallback } from 'react'
import { useAnswerYes, useThinkingDetect } from './index'

/**
 * Composes all onPtyData handlers for a Claude tab into a single callback.
 * Add new handlers to pty-handlers/ and wire them in here.
 */
export function usePtyHandlers(
  autoPilot: boolean,
  write: ((data: string) => void) | null,
  tabId: string,
  groupId: string,
): (data: string) => void {
  const answerYes = useAnswerYes(autoPilot, write)
  const thinkingDetect = useThinkingDetect(tabId, groupId)

  const onPtyData = useCallback((data: string) => {
    answerYes(data)
    thinkingDetect(data)
  }, [answerYes, thinkingDetect])

  return onPtyData
}
