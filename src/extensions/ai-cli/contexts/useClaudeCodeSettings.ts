import { create } from 'zustand'
import { useConfigStore } from '@/store/config'
import { DEFAULT_START_WORK_PROMPT_TEMPLATE } from '@/types/app-config'

export interface ClaudeCodeSettings {
  allowYoloMode: boolean
  yoloModeByDefault: boolean
  autoPilotScanMs: number
  disableBackgroundTasks: boolean
  agentTeams: boolean
  effortLevelMax: boolean
  disableAdaptiveThinking: boolean
  maxThinkingTokens: number
  disable1MContext: boolean
  disableTelemetry: boolean
  remoteControl: boolean
  startWorkPromptTemplate: string
}

const defaults: ClaudeCodeSettings = {
  allowYoloMode: false,
  yoloModeByDefault: false,
  autoPilotScanMs: 250,
  disableBackgroundTasks: true,
  agentTeams: false,
  effortLevelMax: false,
  disableAdaptiveThinking: false,
  maxThinkingTokens: 63999,
  disable1MContext: false,
  disableTelemetry: false,
  remoteControl: false,
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
    const claudeCode = state.config.aiCli?.claudeCode
    if (claudeCode) useClaudeCodeSettings.setState(claudeCode)
  }
})
