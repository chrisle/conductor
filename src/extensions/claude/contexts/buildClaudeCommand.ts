import type { ClaudeSettings } from './useClaudeSettings'

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
 *   cd /path && CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 claude --dangerously-skip-permissions --resume <id>\n
 */
export function buildClaudeCommand(
  command: string,
  settings: Pick<ClaudeSettings, 'skipDangerousPermissions' | 'disableBackgroundTasks'>,
): string {
  const envPrefix = settings.disableBackgroundTasks
    ? 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 '
    : ''

  const flags = settings.skipDangerousPermissions
    ? ' --dangerously-skip-permissions'
    : ''

  // Replace the `claude` invocation, leaving anything before/after it intact.
  return command.replace(/\bclaude\b/, `${envPrefix}claude${flags}`)
}
