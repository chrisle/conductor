import type { ClaudeCodeSettings } from './useClaudeCodeSettings'

/**
 * Rewrites a claude initialCommand to inject flags and env vars from settings.
 *
 * Works for all command forms:
 *   claude\n
 *   cd /path && claude\n
 *   claude --resume <id>\n
 *   cd /path && claude 'prompt'\n
 *
 * Result examples (with all options on):
 *   CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 claude --dangerously-skip-permissions\n
 *   cd /path && CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 claude --allow-dangerously-skip-permissions --resume <id>\n
 */
export function buildClaudeCommand(
  command: string,
  settings: Pick<
    ClaudeCodeSettings,
    | 'allowYoloMode'
    | 'yoloModeByDefault'
    | 'disableBackgroundTasks'
    | 'agentTeams'
    | 'effortLevelMax'
    | 'disableAdaptiveThinking'
    | 'maxThinkingTokens'
    | 'disable1MContext'
    | 'disableTelemetry'
  >,
  apiKey?: string,
): string {
  // On Windows, conductord starts a PowerShell PTY — emit `$env:FOO='bar'`
  // instead of POSIX `export FOO=bar`, which PowerShell does not understand.
  const isWindows = typeof window !== 'undefined'
    && typeof window.electronAPI !== 'undefined'
    && window.electronAPI.platform === 'win32'
  const envStmt = isWindows
    ? (name: string, value: string) => `$env:${name}='${value}'`
    : (name: string, value: string) => `export ${name}=${value}`

  const envVars: string[] = []
  if (apiKey) envVars.push(envStmt('ANTHROPIC_API_KEY', apiKey))
  if (settings.disableBackgroundTasks) envVars.push(envStmt('CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', '1'))
  if (settings.agentTeams) envVars.push(envStmt('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', '1'))
  if (settings.effortLevelMax) envVars.push(envStmt('CLAUDE_CODE_EFFORT_LEVEL', 'max'))
  if (settings.disableAdaptiveThinking) envVars.push(envStmt('CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING', '1'))
  if (settings.maxThinkingTokens > 0) envVars.push(envStmt('MAX_THINKING_TOKENS', String(settings.maxThinkingTokens)))
  if (settings.disable1MContext) envVars.push(envStmt('CLAUDE_CODE_DISABLE_1M_CONTEXT', '1'))
  if (settings.disableTelemetry) envVars.push(envStmt('DISABLE_TELEMETRY', '1'))

  // yoloModeByDefault => always bypass permissions (--dangerously-skip-permissions)
  // allowYoloMode only => make the option available but not default (--allow-dangerously-skip-permissions)
  const flags = settings.yoloModeByDefault
    ? ' --dangerously-skip-permissions'
    : settings.allowYoloMode
      ? ' --allow-dangerously-skip-permissions'
      : ''

  // Replace the `claude` invocation, leaving anything before/after it intact.
  let result = command.replace(/\bclaude\b/, `claude${flags}`)

  // Prepend env vars as export statements so they work reliably in all
  // shell invocation modes (conductord uses `zsh -lic "cmd"`).
  if (envVars.length > 0) {
    result = envVars.join('; ') + '; ' + result
  }

  return result
}
