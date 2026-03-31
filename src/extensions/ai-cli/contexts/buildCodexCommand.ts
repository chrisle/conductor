import type { CodexSettings } from './useCodexSettings'

/**
 * Rewrites a codex initialCommand to inject any flags/env vars from settings.
 * Extension point for future Codex-specific configuration.
 */
export function buildCodexCommand(
  command: string,
  _settings: Pick<CodexSettings, never>,
): string {
  return command
}
