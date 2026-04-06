export interface JiraConnection {
  id: string
  name: string
  domain: string
  email: string
  apiToken: string
}

export interface ClaudeAccount {
  id: string
  name: string
  apiKey: string
}

export interface TerminalCustomization {
  fontFamily: string
  fontSize: number
  lineHeight: number
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  colorTheme: 'default' | 'monokai' | 'solarized-dark' | 'dracula' | 'nord'
  scrollback: number
}

export interface EditorCustomization {
  fontFamily: string
  fontSize: number
  lineHeight: number
  tabSize: number
  wordWrap: 'on' | 'off' | 'wordWrapColumn'
  minimap: boolean
  renderWhitespace: 'none' | 'selection' | 'all'
}

export interface KeyboardShortcut {
  id: string
  label: string
  keys: string
}

export interface AppConfig {
  version: 1
  ui: {
    zoom: number
    kanbanCompactColumns: string[]
  }
  claudeAccounts: ClaudeAccount[]
  jiraConnections: JiraConnection[]
  aiCli: {
    claudeCode: {
      skipDangerousPermissions: boolean
      autoPilotScanMs: number
      disableBackgroundTasks: boolean
      agentTeams: boolean
      startWorkPromptTemplate: string
    }
    codex: {
      autoPilotScanMs: number
    }
  }
  extensions: {
    disabled: string[]
  }
  customization: {
    terminal: TerminalCustomization
    editor: EditorCustomization
    keyboardShortcuts: KeyboardShortcut[]
  }
}

export const DEFAULT_TERMINAL_CUSTOMIZATION: TerminalCustomization = {
  fontFamily: "'FiraCode Nerd Font Mono', monospace",
  fontSize: 12,
  lineHeight: 1.0,
  cursorStyle: 'block',
  cursorBlink: true,
  colorTheme: 'default',
  scrollback: 10000,
}

export const DEFAULT_EDITOR_CUSTOMIZATION: EditorCustomization = {
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
  fontSize: 12,
  lineHeight: 1.6,
  tabSize: 2,
  wordWrap: 'on',
  minimap: false,
  renderWhitespace: 'selection',
}

export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { id: 'goToFile', label: 'Go to File', keys: 'Meta+g' },
  { id: 'nextTab', label: 'Next Tab', keys: 'Meta+Shift+]' },
  { id: 'prevTab', label: 'Previous Tab', keys: 'Meta+Shift+[' },
  { id: 'toggleSidebar', label: 'Toggle Sidebar', keys: 'Meta+b' },
  { id: 'zoomIn', label: 'Zoom In', keys: 'Meta+=' },
  { id: 'zoomOut', label: 'Zoom Out', keys: 'Meta+-' },
  { id: 'zoomReset', label: 'Reset Zoom', keys: 'Meta+0' },
]

export const DEFAULT_START_WORK_PROMPT_TEMPLATE = [
  'Use the claude.ai Atlassian MCP (cloud ID 8fd881b3-a07f-4662-bad9-1a9d9e0321a3) to fetch {{ticketKey}} from the {{projectKey}} project in {{domain}}.',
  'Work autonomously on this ticket end to end.',
  '',
  'Requirements:',
  '- Pull latest from main (or dev if main doesn\'t exist) before starting.',
  '- Write tests for any changes you make. Run the tests and fix them until they pass.',
  '- Run the full test suite to make sure nothing is broken.',
  '- Only commit changes related to this ticket — keep the PR clean and focused.',
  '- When done, push your branch and open a PR (or update an existing one).',
  '- Update the PR description with a detailed summary of what you did, why, and how to verify.',
  '- Add clear inline comments in the code to explain non-obvious logic.',
].join('\n')

export const DEFAULT_APP_CONFIG: AppConfig = {
  version: 1,
  ui: {
    zoom: 1,
    kanbanCompactColumns: [],
  },
  claudeAccounts: [],
  jiraConnections: [],
  aiCli: {
    claudeCode: {
      skipDangerousPermissions: false,
      autoPilotScanMs: 250,
      disableBackgroundTasks: true,
      agentTeams: false,
      startWorkPromptTemplate: DEFAULT_START_WORK_PROMPT_TEMPLATE,
    },
    codex: {
      autoPilotScanMs: 250,
    },
  },
  extensions: {
    disabled: [],
  },
  customization: {
    terminal: { ...DEFAULT_TERMINAL_CUSTOMIZATION },
    editor: { ...DEFAULT_EDITOR_CUSTOMIZATION },
    keyboardShortcuts: [...DEFAULT_KEYBOARD_SHORTCUTS],
  },
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
