import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useConfigStore } from '../store/config'
import { DEFAULT_APP_CONFIG } from '../types/app-config'
import type { AppConfig } from '../types/app-config'

function resetStore() {
  useConfigStore.setState({
    config: { ...DEFAULT_APP_CONFIG },
    ready: false,
  })
}

describe('useConfigStore', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with default config', () => {
      expect(useConfigStore.getState().config.version).toBe(1)
      expect(useConfigStore.getState().config.ui.zoom).toBe(1)
    })

    it('starts not ready', () => {
      expect(useConfigStore.getState().ready).toBe(false)
    })
  })

  describe('initialize', () => {
    it('loads existing config and deep-merges with defaults', async () => {
      const savedConfig: AppConfig = {
        ...DEFAULT_APP_CONFIG,
        ui: { zoom: 1.5, kanbanCompactColumns: ['Done'] },
      }
      vi.mocked(window.electronAPI.loadConfig).mockResolvedValue(savedConfig)
      await useConfigStore.getState().initialize()
      expect(useConfigStore.getState().ready).toBe(true)
      expect(useConfigStore.getState().config.ui.zoom).toBe(1.5)
      expect(useConfigStore.getState().config.ui.kanbanCompactColumns).toEqual(['Done'])
    })

    it('preserves default fields missing from loaded config', async () => {
      const partial = {
        version: 1,
        ui: { zoom: 2 },
      } as any
      vi.mocked(window.electronAPI.loadConfig).mockResolvedValue(partial)
      await useConfigStore.getState().initialize()
      expect(useConfigStore.getState().config.aiCli.claudeCode.disableBackgroundTasks).toBe(true)
      expect(useConfigStore.getState().config.extensions.disabled).toEqual([])
    })

    it('migrates from localStorage when no config exists', async () => {
      vi.mocked(window.electronAPI.loadConfig).mockResolvedValue(null)
      await useConfigStore.getState().initialize()
      expect(useConfigStore.getState().ready).toBe(true)
      expect(window.electronAPI.saveConfig).toHaveBeenCalled()
    })

    it('sets ready even when initialization fails', async () => {
      vi.mocked(window.electronAPI.loadConfig).mockRejectedValue(new Error('fail'))
      await useConfigStore.getState().initialize()
      expect(useConfigStore.getState().ready).toBe(true)
    })
  })

  describe('setConfig', () => {
    it('saves config to electronAPI and updates store', async () => {
      const newConfig = { ...DEFAULT_APP_CONFIG, ui: { ...DEFAULT_APP_CONFIG.ui, zoom: 2 } }
      await useConfigStore.getState().setConfig(newConfig)
      expect(window.electronAPI.saveConfig).toHaveBeenCalledWith(newConfig)
      expect(useConfigStore.getState().config.ui.zoom).toBe(2)
    })
  })

  describe('patchConfig', () => {
    it('patches config via electronAPI and updates store', async () => {
      const merged = { ...DEFAULT_APP_CONFIG, ui: { ...DEFAULT_APP_CONFIG.ui, zoom: 1.2 } }
      vi.mocked(window.electronAPI.patchConfig).mockResolvedValue(merged)
      await useConfigStore.getState().patchConfig({ ui: { zoom: 1.2 } })
      expect(useConfigStore.getState().config.ui.zoom).toBe(1.2)
    })
  })

  describe('setZoom', () => {
    it('updates zoom in state and patches config', async () => {
      await useConfigStore.getState().setZoom(1.5)
      expect(useConfigStore.getState().config.ui.zoom).toBe(1.5)
      expect(window.electronAPI.patchConfig).toHaveBeenCalledWith({ ui: { zoom: 1.5 } })
    })
  })

  describe('setKanbanCompactColumns', () => {
    it('updates compact columns and patches config', async () => {
      await useConfigStore.getState().setKanbanCompactColumns(['Done', 'Closed'])
      expect(useConfigStore.getState().config.ui.kanbanCompactColumns).toEqual(['Done', 'Closed'])
      expect(window.electronAPI.patchConfig).toHaveBeenCalledWith({
        ui: { kanbanCompactColumns: ['Done', 'Closed'] },
      })
    })
  })

  describe('setClaudeCodeSettings', () => {
    it('merges claude code settings and patches', async () => {
      await useConfigStore.getState().setClaudeCodeSettings({ skipDangerousPermissions: true })
      expect(useConfigStore.getState().config.aiCli.claudeCode.skipDangerousPermissions).toBe(true)
      expect(useConfigStore.getState().config.aiCli.claudeCode.disableBackgroundTasks).toBe(true)
    })
  })

  describe('setCodexSettings', () => {
    it('merges codex settings and patches', async () => {
      await useConfigStore.getState().setCodexSettings({ autoPilotScanMs: 500 })
      expect(useConfigStore.getState().config.aiCli.codex.autoPilotScanMs).toBe(500)
    })
  })

  describe('setDisabledExtensions', () => {
    it('sets disabled extensions list', async () => {
      await useConfigStore.getState().setDisabledExtensions(['ext-1', 'ext-2'])
      expect(useConfigStore.getState().config.extensions.disabled).toEqual(['ext-1', 'ext-2'])
      expect(window.electronAPI.patchConfig).toHaveBeenCalledWith({
        extensions: { disabled: ['ext-1', 'ext-2'] },
      })
    })
  })

  describe('Claude accounts', () => {
    it('addClaudeAccount adds an account', async () => {
      const account = { id: 'acc-1', name: 'Test', apiKey: 'sk-test' }
      await useConfigStore.getState().addClaudeAccount(account)
      expect(useConfigStore.getState().config.claudeAccounts).toHaveLength(1)
      expect(useConfigStore.getState().config.claudeAccounts[0]).toEqual(account)
    })

    it('addClaudeAccount appends to existing accounts', async () => {
      const acc1 = { id: 'acc-1', name: 'First', apiKey: 'sk-1' }
      const acc2 = { id: 'acc-2', name: 'Second', apiKey: 'sk-2' }
      await useConfigStore.getState().addClaudeAccount(acc1)
      await useConfigStore.getState().addClaudeAccount(acc2)
      expect(useConfigStore.getState().config.claudeAccounts).toHaveLength(2)
    })

    it('updateClaudeAccount updates matching account', async () => {
      const account = { id: 'acc-1', name: 'Old', apiKey: 'sk-1' }
      await useConfigStore.getState().addClaudeAccount(account)
      await useConfigStore.getState().updateClaudeAccount('acc-1', { name: 'New' })
      expect(useConfigStore.getState().config.claudeAccounts[0].name).toBe('New')
      expect(useConfigStore.getState().config.claudeAccounts[0].apiKey).toBe('sk-1')
    })

    it('removeClaudeAccount removes matching account', async () => {
      await useConfigStore.getState().addClaudeAccount({ id: 'acc-1', name: 'A', apiKey: 'k1' })
      await useConfigStore.getState().addClaudeAccount({ id: 'acc-2', name: 'B', apiKey: 'k2' })
      await useConfigStore.getState().removeClaudeAccount('acc-1')
      expect(useConfigStore.getState().config.claudeAccounts).toHaveLength(1)
      expect(useConfigStore.getState().config.claudeAccounts[0].id).toBe('acc-2')
    })
  })

  describe('Jira connections', () => {
    const conn = {
      id: 'jira-1',
      name: 'Test Jira',
      domain: 'test.atlassian.net',
      email: 'test@test.com',
      apiToken: 'token-123',
    }

    it('addJiraConnection adds a connection', async () => {
      await useConfigStore.getState().addJiraConnection(conn)
      expect(useConfigStore.getState().config.jiraConnections).toHaveLength(1)
      expect(useConfigStore.getState().config.jiraConnections[0]).toEqual(conn)
    })

    it('updateJiraConnection updates matching connection', async () => {
      await useConfigStore.getState().addJiraConnection(conn)
      await useConfigStore.getState().updateJiraConnection('jira-1', { name: 'Updated Jira' })
      expect(useConfigStore.getState().config.jiraConnections[0].name).toBe('Updated Jira')
      expect(useConfigStore.getState().config.jiraConnections[0].domain).toBe('test.atlassian.net')
    })

    it('removeJiraConnection removes matching connection', async () => {
      await useConfigStore.getState().addJiraConnection(conn)
      await useConfigStore.getState().addJiraConnection({ ...conn, id: 'jira-2', name: 'Other' })
      await useConfigStore.getState().removeJiraConnection('jira-1')
      expect(useConfigStore.getState().config.jiraConnections).toHaveLength(1)
      expect(useConfigStore.getState().config.jiraConnections[0].id).toBe('jira-2')
    })

    it('getActiveJiraConnection returns first connection', async () => {
      await useConfigStore.getState().addJiraConnection(conn)
      await useConfigStore.getState().addJiraConnection({ ...conn, id: 'jira-2', name: 'Second' })
      expect(useConfigStore.getState().getActiveJiraConnection()?.id).toBe('jira-1')
    })

    it('getActiveJiraConnection returns null when no connections', () => {
      expect(useConfigStore.getState().getActiveJiraConnection()).toBeNull()
    })
  })
})
