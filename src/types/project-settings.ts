/**
 * Settings that can be configured per-project or per-workspace.
 * Workspace settings override project settings; project settings override defaults.
 * All fields are optional so partial overrides work naturally.
 */
export interface ProjectSettings {
  terminal?: Record<string, never>
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
