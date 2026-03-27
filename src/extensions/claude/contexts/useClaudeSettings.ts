import { create } from 'zustand'

export interface ClaudeSettings {
  skipDangerousPermissions: boolean
  autoPilotScanMs: number
  disableBackgroundTasks: boolean
}

const STORAGE_KEY = 'conductor:claude-settings'

const defaults: ClaudeSettings = {
  skipDangerousPermissions: false,
  autoPilotScanMs: 250,
  disableBackgroundTasks: true,
}

function load(): ClaudeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...defaults }
}

function save(settings: ClaudeSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
}

interface ClaudeSettingsStore extends ClaudeSettings {
  update: (patch: Partial<ClaudeSettings>) => void
}

export const useClaudeSettings = create<ClaudeSettingsStore>((set) => ({
  ...load(),
  update: (patch) =>
    set((state) => {
      const next = { ...state, ...patch }
      save(next)
      return next
    }),
}))
