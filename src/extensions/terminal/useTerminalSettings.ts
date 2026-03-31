import { create } from 'zustand'
import { useConfigStore } from '@/store/config'

export type TerminalRenderer = 'ghostty' | 'xterm'

export interface TerminalSettings {
  renderer: TerminalRenderer
}

const defaults: TerminalSettings = {
  renderer: 'xterm',
}

interface TerminalSettingsStore extends TerminalSettings {
  update: (patch: Partial<TerminalSettings>) => void
}

export const useTerminalSettings = create<TerminalSettingsStore>((set) => ({
  ...defaults,
  update: (patch) =>
    set((state) => {
      const next = { ...state, ...patch }
      useConfigStore.getState().setTerminalSettings(patch)
      return next
    }),
}))

// Hydrate from config store once ready
useConfigStore.subscribe((state) => {
  if (state.ready && state.config.terminal) {
    useTerminalSettings.setState(state.config.terminal)
  }
})
