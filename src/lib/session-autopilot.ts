/**
 * Persist autopilot state per tmux session as part of the project.
 * Delegates to the project store, which serializes into .conductor files.
 */
import { useProjectStore } from '@/store/project'

export function getSessionAutoPilot(sessionId: string): boolean {
  return useProjectStore.getState().sessionAutoPilot[sessionId] ?? false
}

export function setSessionAutoPilot(sessionId: string, enabled: boolean) {
  useProjectStore.getState().setSessionAutoPilot(sessionId, enabled)
}

export function clearSessionAutoPilot(sessionId: string) {
  useProjectStore.getState().clearSessionAutoPilot(sessionId)
}
