import { create } from 'zustand'
import { useConfigStore } from '@/store/config'
import { DEFAULT_START_WORK_PROMPT_TEMPLATE } from '@/types/app-config'

export interface ClaudeCodeSettings {
  skipDangerousPermissions: boolean
  autoPilotScanMs: number
  disableBackgroundTasks: boolean
  agentTeams: boolean
  startWorkPromptTemplate: string
}

const defaults: ClaudeCodeSettings = {
  skipDangerousPermissions: false,
  autoPilotScanMs: 250,
  disableBackgroundTasks: true,
  agentTeams: false,
  startWorkPromptTemplate: DEFAULT_START_WORK_PROMPT_TEMPLATE,
}

interface ClaudeCodeSettingsStore extends ClaudeCodeSettings {
  update: (patch: Partial<ClaudeCodeSettings>) => void
}

export const useClaudeCodeSettings = create<ClaudeCodeSettingsStore>((set) => ({
  ...defaults,
  update: (patch) =>
    set((state) => {
      const next = { ...state, ...patch }
      useConfigStore.getState().setClaudeCodeSettings(patch)
      return next
    }),
}))

// Hydrate from config store once ready
useConfigStore.subscribe((state) => {
  if (state.ready) {
    useClaudeCodeSettings.setState(state.config.aiCli.claudeCode)
  }
})
