/**
 * Persist autopilot state per tmux session as part of the project.
 * Delegates to the project store, which serializes into .conductor files.
 */
import { useProjectStore } from '@/store/project'

export function getSessionAutoPilot(sessionId: string): boolean {
  const state = useProjectStore.getState() as unknown as Record<string, unknown>
  const map = state.sessionAutoPilot as Record<string, boolean> | undefined
  return map?.[sessionId] ?? false
}

export function setSessionAutoPilot(sessionId: string, enabled: boolean) {
  const state = useProjectStore.getState() as unknown as Record<string, unknown>
  if (typeof state.setSessionAutoPilot === 'function') {
    ;(state.setSessionAutoPilot as (id: string, v: boolean) => void)(sessionId, enabled)
  }
}

export function clearSessionAutoPilot(sessionId: string) {
  const state = useProjectStore.getState() as unknown as Record<string, unknown>
  if (typeof state.clearSessionAutoPilot === 'function') {
    ;(state.clearSessionAutoPilot as (id: string) => void)(sessionId)
  }
}
