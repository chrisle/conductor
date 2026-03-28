import { describe, it, expect } from 'vitest'
import { buildClaudeCommand } from '../extensions/claude/contexts/buildClaudeCommand'

const base = { skipDangerousPermissions: false, disableBackgroundTasks: false }

describe('buildClaudeCommand', () => {
  it('returns the command unchanged when no options are set', () => {
    expect(buildClaudeCommand('claude\n', base)).toBe('claude\n')
  })

  it('adds --dangerously-skip-permissions flag', () => {
    const result = buildClaudeCommand('claude\n', { ...base, skipDangerousPermissions: true })
    expect(result).toBe('claude --dangerously-skip-permissions\n')
  })

  it('adds env var prefix when disableBackgroundTasks is set', () => {
    const result = buildClaudeCommand('claude\n', { ...base, disableBackgroundTasks: true })
    expect(result).toBe('CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 claude\n')
  })

  it('adds both env var and flag when both options are set', () => {
    const result = buildClaudeCommand('claude\n', {
      skipDangerousPermissions: true,
      disableBackgroundTasks: true,
    })
    expect(result).toBe('CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 claude --dangerously-skip-permissions\n')
  })

  it('preserves cd prefix before claude', () => {
    const result = buildClaudeCommand('cd /some/path && claude\n', {
      skipDangerousPermissions: true,
      disableBackgroundTasks: true,
    })
    expect(result).toBe('cd /some/path && CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 claude --dangerously-skip-permissions\n')
  })

  it('preserves --resume flag after claude', () => {
    const result = buildClaudeCommand('claude --resume abc123\n', {
      skipDangerousPermissions: true,
      disableBackgroundTasks: false,
    })
    expect(result).toBe('claude --dangerously-skip-permissions --resume abc123\n')
  })

  it('preserves a prompt argument after claude', () => {
    const result = buildClaudeCommand("cd /path && claude 'fix the bug'\n", {
      skipDangerousPermissions: false,
      disableBackgroundTasks: true,
    })
    expect(result).toBe("cd /path && CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 claude 'fix the bug'\n")
  })

  it('only replaces the first occurrence of claude', () => {
    // edge case: if "claude" appears in a path or argument
    const result = buildClaudeCommand('claude --resume claude\n', {
      skipDangerousPermissions: true,
      disableBackgroundTasks: false,
    })
    expect(result).toBe('claude --dangerously-skip-permissions --resume claude\n')
  })
})
