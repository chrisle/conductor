import { describe, it, expect } from 'vitest'
import { buildClaudeCommand } from '../extensions/ai-cli/contexts/buildClaudeCommand'

const base = { allowYoloMode: false, yoloModeByDefault: false, disableBackgroundTasks: false, agentTeams: false }

describe('buildClaudeCommand', () => {
  it('returns the command unchanged when no options are set', () => {
    expect(buildClaudeCommand('claude\n', base)).toBe('claude\n')
  })

  it('adds --allow-dangerously-skip-permissions when allowYoloMode is set', () => {
    const result = buildClaudeCommand('claude\n', { ...base, allowYoloMode: true })
    expect(result).toBe('claude --allow-dangerously-skip-permissions\n')
  })

  it('adds --dangerously-skip-permissions when yoloModeByDefault is set', () => {
    const result = buildClaudeCommand('claude\n', { ...base, allowYoloMode: true, yoloModeByDefault: true })
    expect(result).toBe('claude --dangerously-skip-permissions\n')
  })

  it('adds export prefix when disableBackgroundTasks is set', () => {
    const result = buildClaudeCommand('claude\n', { ...base, disableBackgroundTasks: true })
    expect(result).toBe('export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1; claude\n')
  })

  it('adds both export and flag when both options are set', () => {
    const result = buildClaudeCommand('claude\n', {
      allowYoloMode: true,
      yoloModeByDefault: true,
      disableBackgroundTasks: true,
      agentTeams: false,
    })
    expect(result).toBe('export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1; claude --dangerously-skip-permissions\n')
  })

  it('preserves cd prefix before claude', () => {
    const result = buildClaudeCommand('cd /some/path && claude\n', {
      allowYoloMode: true,
      yoloModeByDefault: true,
      disableBackgroundTasks: true,
      agentTeams: false,
    })
    expect(result).toBe('export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1; cd /some/path && claude --dangerously-skip-permissions\n')
  })

  it('preserves --resume flag after claude', () => {
    const result = buildClaudeCommand('claude --resume abc123\n', {
      allowYoloMode: true,
      yoloModeByDefault: true,
      disableBackgroundTasks: false,
      agentTeams: false,
    })
    expect(result).toBe('claude --dangerously-skip-permissions --resume abc123\n')
  })

  it('preserves a prompt argument after claude', () => {
    const result = buildClaudeCommand("cd /path && claude 'fix the bug'\n", {
      allowYoloMode: false,
      yoloModeByDefault: false,
      disableBackgroundTasks: true,
      agentTeams: false,
    })
    expect(result).toBe("export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1; cd /path && claude 'fix the bug'\n")
  })

  it('only replaces the first occurrence of claude', () => {
    const result = buildClaudeCommand('claude --resume claude\n', {
      allowYoloMode: true,
      yoloModeByDefault: true,
      disableBackgroundTasks: false,
      agentTeams: false,
    })
    expect(result).toBe('claude --dangerously-skip-permissions --resume claude\n')
  })

  it('adds multiple export statements when multiple env vars are set', () => {
    const result = buildClaudeCommand('claude\n', {
      allowYoloMode: false,
      yoloModeByDefault: false,
      disableBackgroundTasks: true,
      agentTeams: true,
    })
    expect(result).toBe('export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1; export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1; claude\n')
  })

  it('adds API key as export', () => {
    const result = buildClaudeCommand('claude\n', base, 'sk-test-123')
    expect(result).toBe('export ANTHROPIC_API_KEY=sk-test-123; claude\n')
  })
})
