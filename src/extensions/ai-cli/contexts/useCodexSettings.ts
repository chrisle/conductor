import { create } from 'zustand'
import { useConfigStore } from '@/store/config'

export interface CodexSettings {
  autoPilotScanMs: number
}

const defaults: CodexSettings = {
  autoPilotScanMs: 250,
}

interface CodexSettingsStore extends CodexSettings {
  update: (patch: Partial<CodexSettings>) => void
}

export const useCodexSettings = create<CodexSettingsStore>((set) => ({
  ...defaults,
  update: (patch) =>
    set((state) => {
      const next = { ...state, ...patch }
      useConfigStore.getState().setCodexSettings(patch)
      return next
    }),
}))

// Hydrate from config store once ready
useConfigStore.subscribe((state) => {
  if (state.ready) {
    const codex = state.config.aiCli?.codex
    if (codex) useCodexSettings.setState(codex)
  }
})
