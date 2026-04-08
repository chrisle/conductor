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
  settings: Pick<ClaudeCodeSettings, 'allowYoloMode' | 'yoloModeByDefault' | 'disableBackgroundTasks' | 'agentTeams'>,
  apiKey?: string,
): string {
  const envVars: string[] = []
  if (apiKey) envVars.push(`export ANTHROPIC_API_KEY=${apiKey}`)
  if (settings.disableBackgroundTasks) envVars.push('export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1')
  if (settings.agentTeams) envVars.push('export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1')

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
