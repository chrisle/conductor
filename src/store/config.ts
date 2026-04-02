import { create } from 'zustand'
import type { AppConfig, ClaudeAccount, JiraConnection, DeepPartial } from '../types/app-config'
import { DEFAULT_APP_CONFIG } from '../types/app-config'

export interface ConfigState {
  config: AppConfig
  ready: boolean

  initialize: () => Promise<void>
  setConfig: (config: AppConfig) => Promise<void>
  patchConfig: (patch: DeepPartial<AppConfig>) => Promise<void>

  // Convenience setters
  setZoom: (zoom: number) => Promise<void>
  setKanbanCompactColumns: (columns: string[]) => Promise<void>
  setClaudeCodeSettings: (patch: Partial<AppConfig['aiCli']['claudeCode']>) => Promise<void>
  setCodexSettings: (patch: Partial<AppConfig['aiCli']['codex']>) => Promise<void>
  setDisabledExtensions: (disabled: string[]) => Promise<void>

  // Claude account management
  addClaudeAccount: (account: ClaudeAccount) => Promise<void>
  updateClaudeAccount: (id: string, patch: Partial<ClaudeAccount>) => Promise<void>
  removeClaudeAccount: (id: string) => Promise<void>

  // Jira connection management
  addJiraConnection: (connection: JiraConnection) => Promise<void>
  updateJiraConnection: (id: string, patch: Partial<JiraConnection>) => Promise<void>
  removeJiraConnection: (id: string) => Promise<void>
  getActiveJiraConnection: () => JiraConnection | null
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: { ...DEFAULT_APP_CONFIG },
  ready: false,

  initialize: async () => {
    try {
      const loaded = await window.electronAPI.loadConfig()
      if (loaded && loaded.version === 1) {
        // Deep-merge with defaults so newly-added fields are always present
        const merged: AppConfig = {
          ...DEFAULT_APP_CONFIG,
          ...loaded,
          ui: { ...DEFAULT_APP_CONFIG.ui, ...loaded.ui },
          claudeAccounts: loaded.claudeAccounts ?? DEFAULT_APP_CONFIG.claudeAccounts,
          jiraConnections: loaded.jiraConnections ?? DEFAULT_APP_CONFIG.jiraConnections,
          aiCli: {
            claudeCode: { ...DEFAULT_APP_CONFIG.aiCli.claudeCode, ...loaded.aiCli?.claudeCode },
            codex: { ...DEFAULT_APP_CONFIG.aiCli.codex, ...loaded.aiCli?.codex },
          },
          extensions: { ...DEFAULT_APP_CONFIG.extensions, ...loaded.extensions },
        }
        set({ config: merged, ready: true })
        return
      }

      // No config.json exists — migrate from localStorage
      const migrated = migrateFromLocalStorage()
      await window.electronAPI.saveConfig(migrated)
      clearLegacyLocalStorage()
      set({ config: migrated, ready: true })
    } catch {
      set({ ready: true })
    }
  },

  setConfig: async (config) => {
    await window.electronAPI.saveConfig(config)
    set({ config })
  },

  patchConfig: async (patch) => {
    const merged = await window.electronAPI.patchConfig(patch)
    set({ config: merged })
  },

  setZoom: async (zoom) => {
    set(state => ({ config: { ...state.config, ui: { ...state.config.ui, zoom } } }))
    await window.electronAPI.patchConfig({ ui: { zoom } })
  },

  setKanbanCompactColumns: async (columns) => {
    set(state => ({
      config: { ...state.config, ui: { ...state.config.ui, kanbanCompactColumns: columns } },
    }))
    await window.electronAPI.patchConfig({ ui: { kanbanCompactColumns: columns } })
  },

  setClaudeCodeSettings: async (patch) => {
    set(state => ({
      config: {
        ...state.config,
        aiCli: { ...state.config.aiCli, claudeCode: { ...state.config.aiCli.claudeCode, ...patch } },
      },
    }))
    await window.electronAPI.patchConfig({ aiCli: { claudeCode: patch } } as any)
  },

  setCodexSettings: async (patch) => {
    set(state => ({
      config: {
        ...state.config,
        aiCli: { ...state.config.aiCli, codex: { ...state.config.aiCli.codex, ...patch } },
      },
    }))
    await window.electronAPI.patchConfig({ aiCli: { codex: patch } } as any)
  },

  setDisabledExtensions: async (disabled) => {
    set(state => ({
      config: { ...state.config, extensions: { ...state.config.extensions, disabled } },
    }))
    await window.electronAPI.patchConfig({ extensions: { disabled } })
  },

  addClaudeAccount: async (account) => {
    const accounts = [...get().config.claudeAccounts, account]
    set(state => ({
      config: { ...state.config, claudeAccounts: accounts },
    }))
    await window.electronAPI.patchConfig({ claudeAccounts: accounts } as any)
  },

  updateClaudeAccount: async (id, patch) => {
    const accounts = get().config.claudeAccounts.map(a =>
      a.id === id ? { ...a, ...patch } : a
    )
    set(state => ({
      config: { ...state.config, claudeAccounts: accounts },
    }))
    await window.electronAPI.patchConfig({ claudeAccounts: accounts } as any)
  },

  removeClaudeAccount: async (id) => {
    const accounts = get().config.claudeAccounts.filter(a => a.id !== id)
    set(state => ({
      config: { ...state.config, claudeAccounts: accounts },
    }))
    await window.electronAPI.patchConfig({ claudeAccounts: accounts } as any)
  },

  addJiraConnection: async (connection) => {
    const connections = [...get().config.jiraConnections, connection]
    set(state => ({
      config: { ...state.config, jiraConnections: connections },
    }))
    await window.electronAPI.patchConfig({ jiraConnections: connections } as any)
  },

  updateJiraConnection: async (id, patch) => {
    const connections = get().config.jiraConnections.map(c =>
      c.id === id ? { ...c, ...patch } : c
    )
    set(state => ({
      config: { ...state.config, jiraConnections: connections },
    }))
    await window.electronAPI.patchConfig({ jiraConnections: connections } as any)
  },

  removeJiraConnection: async (id) => {
    const connections = get().config.jiraConnections.filter(c => c.id !== id)
    set(state => ({
      config: { ...state.config, jiraConnections: connections },
    }))
    await window.electronAPI.patchConfig({ jiraConnections: connections } as any)
  },

  getActiveJiraConnection: () => {
    return get().config.jiraConnections[0] ?? null
  },
}))

// --- Migration helpers ---

function migrateFromLocalStorage(): AppConfig {
  const config = { ...DEFAULT_APP_CONFIG }

  try {
    const zoom = localStorage.getItem('conductor:zoom')
    if (zoom) config.ui.zoom = parseFloat(zoom) || 1
  } catch {}

  try {
    const compact = localStorage.getItem('conductor:jira:compact')
    if (compact) config.ui.kanbanCompactColumns = JSON.parse(compact)
  } catch {}

  try {
    const claude = localStorage.getItem('conductor:claude-settings')
    if (claude) config.aiCli.claudeCode = { ...config.aiCli.claudeCode, ...JSON.parse(claude) }
  } catch {}

  try {
    const disabled = localStorage.getItem('conductor:extensions:disabled')
    if (disabled) config.extensions.disabled = JSON.parse(disabled)
  } catch {}

  try {
    const jiraRaw = localStorage.getItem('conductor:jira:config')
    if (jiraRaw) {
      const jira = JSON.parse(jiraRaw)
      // Skip migration if it's the hardcoded default config
      if (jira.domain && jira.email && jira.apiToken && jira.domain !== 'triodeofficial') {
        config.jiraConnections = [{
          id: 'migrated-' + jira.domain,
          name: jira.domain,
          domain: jira.domain,
          email: jira.email,
          apiToken: jira.apiToken,
        }]
      }
    }
  } catch {}

  return config
}

function clearLegacyLocalStorage(): void {
  const keys = [
    'conductor:zoom',
    'conductor:jira:compact',
    'conductor:claude-settings',
    'conductor:extensions:disabled',
    'conductor:jira:config',
  ]
  for (const key of keys) {
    try { localStorage.removeItem(key) } catch {}
  }
  // Clear board caches (conductor:jira-board:*)
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('conductor:jira-board:')) toRemove.push(key)
    }
    for (const key of toRemove) localStorage.removeItem(key)
  } catch {}
}
