import { create } from 'zustand'
import { useConfigStore } from '@/store/config'

export interface ClaudeSettings {
  skipDangerousPermissions: boolean
  autoPilotScanMs: number
  disableBackgroundTasks: boolean
}

const defaults: ClaudeSettings = {
  skipDangerousPermissions: false,
  autoPilotScanMs: 250,
  disableBackgroundTasks: true,
}

interface ClaudeSettingsStore extends ClaudeSettings {
  update: (patch: Partial<ClaudeSettings>) => void
}

export const useClaudeSettings = create<ClaudeSettingsStore>((set) => ({
  ...defaults,
  update: (patch) =>
    set((state) => {
      const next = { ...state, ...patch }
      useConfigStore.getState().setClaudeSettings(patch)
      return next
    }),
}))

// Hydrate from config store once ready
useConfigStore.subscribe((state) => {
  if (state.ready) {
    useClaudeSettings.setState(state.config.claude)
  }
})
