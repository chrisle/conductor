import { create } from 'zustand'
import type { WorkSession } from '../types/work-session'

interface WorkSessionsState {
  sessions: WorkSession[]
  ready: boolean

  initialize: () => Promise<void>
  createSession: (session: Omit<WorkSession, 'id' | 'createdAt' | 'updatedAt'>) => Promise<WorkSession>
  updateSession: (id: string, patch: Partial<WorkSession>) => Promise<WorkSession | null>
  getSessionForTicket: (ticketKey: string) => WorkSession | undefined
  getActiveSessionForTicket: (ticketKey: string) => WorkSession | undefined
  completeSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
}

function generateId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useWorkSessionsStore = create<WorkSessionsState>((set, get) => ({
  sessions: [],
  ready: false,

  initialize: async () => {
    try {
      const sessions = await window.electronAPI.getAllWorkSessions()
      set({ sessions, ready: true })
    } catch {
      set({ ready: true })
    }
  },

  createSession: async (input) => {
    const now = new Date().toISOString()
    const session: WorkSession = {
      ...input,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    await window.electronAPI.createWorkSession(session)
    set(state => ({ sessions: [...state.sessions, session] }))
    return session
  },

  updateSession: async (id, patch) => {
    const updated = await window.electronAPI.updateWorkSession(id, patch)
    if (!updated) return null
    set(state => ({
      sessions: state.sessions.map(s => s.id === id ? updated : s),
    }))
    return updated
  },

  getSessionForTicket: (ticketKey) => {
    return get().sessions.find(s => s.ticketKey === ticketKey)
  },

  getActiveSessionForTicket: (ticketKey) => {
    return get().sessions.find(s => s.ticketKey === ticketKey && s.status === 'active')
  },

  completeSession: async (id) => {
    await get().updateSession(id, { status: 'completed' })
  },

  deleteSession: async (id) => {
    await window.electronAPI.deleteWorkSession(id)
    set(state => ({
      sessions: state.sessions.filter(s => s.id !== id),
    }))
  },
}))
