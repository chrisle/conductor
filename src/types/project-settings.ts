/**
 * Settings that can be configured per-project or per-workspace.
 * Workspace settings override project settings; project settings override defaults.
 * All fields are optional so partial overrides work naturally.
 */
export interface ProjectSettings {
  terminal?: {
    tmuxMouse?: boolean
  }
}

export const DEFAULT_PROJECT_SETTINGS: Required<{
  terminal: Required<NonNullable<ProjectSettings['terminal']>>
}> = {
  terminal: {
    tmuxMouse: false,
  },
}

/** Deep-merge workspace settings over project settings over defaults. */
export function resolveSettings(
  project?: ProjectSettings,
  workspace?: ProjectSettings,
): Required<{ terminal: Required<NonNullable<ProjectSettings['terminal']>> }> {
  return {
    terminal: {
      tmuxMouse:
        workspace?.terminal?.tmuxMouse ??
        project?.terminal?.tmuxMouse ??
        DEFAULT_PROJECT_SETTINGS.terminal.tmuxMouse,
    },
  }
}
