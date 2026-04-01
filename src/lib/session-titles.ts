/**
 * Persist custom session titles as part of the project.
 * Delegates to the project store, which serializes into .conductor files.
 */
import { useProjectStore } from '@/store/project'

export function getSessionTitle(sessionId: string): string | null {
  return useProjectStore.getState().sessionTitles[sessionId] ?? null
}

export function setSessionTitle(sessionId: string, title: string) {
  useProjectStore.getState().setSessionTitle(sessionId, title)
}

export function clearSessionTitle(sessionId: string) {
  useProjectStore.getState().clearSessionTitle(sessionId)
}
