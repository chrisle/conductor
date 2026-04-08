import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useConfigStore } from '../store/config'
import { useCodexSettings } from '../extensions/ai-cli/contexts/useCodexSettings'
import { useClaudeCodeSettings } from '../extensions/ai-cli/contexts/useClaudeCodeSettings'
import { DEFAULT_APP_CONFIG } from '../types/app-config'

function resetStores() {
  useConfigStore.setState({
    config: { ...DEFAULT_APP_CONFIG },
    ready: false,
  })
  useCodexSettings.setState({ autoPilotScanMs: 250 })
  useClaudeCodeSettings.setState({
    allowYoloMode: false, yoloModeByDefault: false,
    autoPilotScanMs: 250,
    disableBackgroundTasks: true,
    agentTeams: false,
    startWorkPromptTemplate: DEFAULT_APP_CONFIG.aiCli.claudeCode.startWorkPromptTemplate,
  })
}

describe('AI CLI settings hydration (CON-60)', () => {
  beforeEach(() => {
    resetStores()
    vi.clearAllMocks()
  })

  it('codex settings retain defaults when config.aiCli.codex is missing', async () => {
    // Simulate a config loaded from disk that is missing the codex key
    const configMissingCodex = {
      ...DEFAULT_APP_CONFIG,
      aiCli: {
        claudeCode: DEFAULT_APP_CONFIG.aiCli.claudeCode,
        // codex is intentionally omitted
      },
    } as any

    useConfigStore.setState({ config: configMissingCodex, ready: true })

    // Wait for subscription to fire
    await new Promise(r => setTimeout(r, 0))

    // The codex zustand store should retain its defaults, not crash
    const codex = useCodexSettings.getState()
    expect(codex.autoPilotScanMs).toBe(250)
    expect(typeof codex.update).toBe('function')
  })

  it('claudeCode settings retain defaults when config.aiCli.claudeCode is missing', async () => {
    const configMissingClaudeCode = {
      ...DEFAULT_APP_CONFIG,
      aiCli: {
        codex: DEFAULT_APP_CONFIG.aiCli.codex,
        // claudeCode is intentionally omitted
      },
    } as any

    useConfigStore.setState({ config: configMissingClaudeCode, ready: true })

    await new Promise(r => setTimeout(r, 0))

    const claudeCode = useClaudeCodeSettings.getState()
    expect(claudeCode.autoPilotScanMs).toBe(250)
    expect(claudeCode.disableBackgroundTasks).toBe(true)
    expect(typeof claudeCode.update).toBe('function')
  })

  it('codex settings retain defaults when config.aiCli is missing entirely', async () => {
    const configMissingAiCli = {
      ...DEFAULT_APP_CONFIG,
      aiCli: undefined,
    } as any

    useConfigStore.setState({ config: configMissingAiCli, ready: true })

    await new Promise(r => setTimeout(r, 0))

    const codex = useCodexSettings.getState()
    expect(codex.autoPilotScanMs).toBe(250)
  })

  it('settings hydrate correctly when config has valid data', async () => {
    const fullConfig = {
      ...DEFAULT_APP_CONFIG,
      aiCli: {
        claudeCode: { ...DEFAULT_APP_CONFIG.aiCli.claudeCode, autoPilotScanMs: 500 },
        codex: { autoPilotScanMs: 750 },
      },
    }

    useConfigStore.setState({ config: fullConfig, ready: true })

    await new Promise(r => setTimeout(r, 0))

    expect(useCodexSettings.getState().autoPilotScanMs).toBe(750)
    expect(useClaudeCodeSettings.getState().autoPilotScanMs).toBe(500)
  })

  it('initialize persists merged defaults to disk', async () => {
    const partialConfig = { version: 1, ui: { zoom: 2 } } as any
    vi.mocked(window.electronAPI.loadConfig).mockResolvedValue(partialConfig)

    await useConfigStore.getState().initialize()

    // saveConfig should be called with the merged config including defaults
    expect(window.electronAPI.saveConfig).toHaveBeenCalledTimes(1)
    const savedConfig = vi.mocked(window.electronAPI.saveConfig).mock.calls[0][0] as any
    expect(savedConfig.aiCli.codex.autoPilotScanMs).toBe(250)
    expect(savedConfig.aiCli.claudeCode.disableBackgroundTasks).toBe(true)
    expect(savedConfig.ui.zoom).toBe(2)
  })

  it('patchConfig returning incomplete config does not crash codex settings', async () => {
    // First initialize with full defaults
    vi.mocked(window.electronAPI.loadConfig).mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
    })
    await useConfigStore.getState().initialize()

    // Simulate patchConfig returning a config missing codex (as if disk config lacked it)
    const incompleteResult = {
      ...DEFAULT_APP_CONFIG,
      aiCli: {
        claudeCode: DEFAULT_APP_CONFIG.aiCli.claudeCode,
      },
    } as any
    vi.mocked(window.electronAPI.patchConfig).mockResolvedValue(incompleteResult)

    await useConfigStore.getState().patchConfig({ ui: { zoom: 1.5 } })

    await new Promise(r => setTimeout(r, 0))

    // codex settings should still have defaults
    const codex = useCodexSettings.getState()
    expect(codex.autoPilotScanMs).toBe(250)
  })
})
