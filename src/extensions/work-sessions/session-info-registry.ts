import { create } from 'zustand'
import type { ReactNode } from 'react'
import type { WorkSession } from '@/types/work-session'

/** Context passed to session info providers for rendering custom rows. */
export interface SessionInfoContext {
  /** Session name / identifier */
  sessionName: string
  /** Current working directory */
  cwd: string
  /** Running process name (e.g. "claude", "zsh", "codex") */
  command: string
  /** Whether the session has an attached client */
  connected: boolean
  /** Whether a tab is open for this session in Conductor */
  hasOpenTab: boolean
  /** Whether the session is actively thinking (AI sessions) */
  isThinking: boolean
  /** Associated work session record, if any */
  workSession: WorkSession | null
}

/** A provider that contributes extra rows to the session info panel. */
export interface SessionInfoProvider {
  /** Unique identifier — re-registering the same id replaces the previous. */
  id: string
  /** Sort order (lower = higher in the list). Built-in rows use 0–50. Default: 100. */
  order?: number
  /** Return a ReactNode to render, or null to skip for this session. */
  render: (ctx: SessionInfoContext) => ReactNode | null
}

export interface SessionInfoRegistryState {
  providers: SessionInfoProvider[]
  register: (provider: SessionInfoProvider) => void
  unregister: (id: string) => void
}

export const useSessionInfoRegistry = create<SessionInfoRegistryState>((set) => ({
  providers: [],
  register: (provider) => set(state => {
    const filtered = state.providers.filter(p => p.id !== provider.id)
    const next = [...filtered, provider].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
    return { providers: next }
  }),
  unregister: (id) => set(state => ({
    providers: state.providers.filter(p => p.id !== id),
  })),
}))
