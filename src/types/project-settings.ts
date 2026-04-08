/**
 * Settings that can be configured per-project or per-workspace.
 * Workspace settings override project settings; project settings override defaults.
 * All fields are optional so partial overrides work naturally.
 */
export interface ProjectSettings {
  terminal?: Record<string, never>
  /**
   * ID of the Claude account (from AppConfig.claudeAccounts) to use by default
   * when opening new Claude Code tabs in this project.
   * null = use the global default from AppConfig.defaultClaudeAccountId.
   * undefined = not set (falls through to global default).
   */
  defaultClaudeAccountId?: string | null
}

export const DEFAULT_PROJECT_SETTINGS: Required<{
  terminal: Required<NonNullable<ProjectSettings['terminal']>>
}> = {
  terminal: {},
}

/** Deep-merge workspace settings over project settings over defaults. */
export function resolveSettings(
  _project?: ProjectSettings,
  _workspace?: ProjectSettings,
): Required<{ terminal: Required<NonNullable<ProjectSettings['terminal']>> }> {
  return {
    terminal: {},
  }
}
