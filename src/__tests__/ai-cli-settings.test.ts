import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('buildCodexCommand', () => {
  it('returns command unchanged (passthrough)', async () => {
    const { buildCodexCommand } = await import('../extensions/ai-cli/contexts/buildCodexCommand')
    expect(buildCodexCommand('codex\n', {} as any)).toBe('codex\n')
  })

  it('preserves cd prefix', async () => {
    const { buildCodexCommand } = await import('../extensions/ai-cli/contexts/buildCodexCommand')
    expect(buildCodexCommand('cd /path && codex\n', {} as any)).toBe('cd /path && codex\n')
  })
})

describe('useClaudeCodeSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function freshStore() {
    vi.resetModules()
    const mod = await import('../extensions/ai-cli/contexts/useClaudeCodeSettings')
    return mod.useClaudeCodeSettings
  }

  it('has correct defaults', async () => {
    const store = await freshStore()
    const state = store.getState()
    expect(state.skipDangerousPermissions).toBe(false)
    expect(state.autoPilotScanMs).toBe(250)
    expect(state.disableBackgroundTasks).toBe(true)
  })

  it('update merges partial settings', async () => {
    const store = await freshStore()
    store.getState().update({ skipDangerousPermissions: true })
    expect(store.getState().skipDangerousPermissions).toBe(true)
    expect(store.getState().autoPilotScanMs).toBe(250)
  })

  it('update sets autoPilotScanMs', async () => {
    const store = await freshStore()
    store.getState().update({ autoPilotScanMs: 500 })
    expect(store.getState().autoPilotScanMs).toBe(500)
  })
})

describe('useCodexSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function freshStore() {
    vi.resetModules()
    const mod = await import('../extensions/ai-cli/contexts/useCodexSettings')
    return mod.useCodexSettings
  }

  it('has correct defaults', async () => {
    const store = await freshStore()
    expect(store.getState().autoPilotScanMs).toBe(250)
  })

  it('update changes settings', async () => {
    const store = await freshStore()
    store.getState().update({ autoPilotScanMs: 100 })
    expect(store.getState().autoPilotScanMs).toBe(100)
  })
})

describe('buildClaudeCommand with apiKey', () => {
  it('adds ANTHROPIC_API_KEY env var when apiKey provided', async () => {
    vi.resetModules()
    const { buildClaudeCommand } = await import('../extensions/ai-cli/contexts/buildClaudeCommand')
    const result = buildClaudeCommand('claude\n', {
      skipDangerousPermissions: false,
      disableBackgroundTasks: false,
      agentTeams: false,
    }, 'sk-ant-test-key')
    expect(result).toBe('ANTHROPIC_API_KEY=sk-ant-test-key claude\n')
  })

  it('combines apiKey with other env vars and flags', async () => {
    vi.resetModules()
    const { buildClaudeCommand } = await import('../extensions/ai-cli/contexts/buildClaudeCommand')
    const result = buildClaudeCommand('claude\n', {
      skipDangerousPermissions: true,
      disableBackgroundTasks: true,
      agentTeams: false,
    }, 'sk-key')
    expect(result).toBe('ANTHROPIC_API_KEY=sk-key CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 claude --dangerously-skip-permissions\n')
  })

  it('does not add ANTHROPIC_API_KEY when apiKey is undefined', async () => {
    vi.resetModules()
    const { buildClaudeCommand } = await import('../extensions/ai-cli/contexts/buildClaudeCommand')
    const result = buildClaudeCommand('claude\n', {
      skipDangerousPermissions: false,
      disableBackgroundTasks: false,
      agentTeams: false,
    })
    expect(result).toBe('claude\n')
  })
})
