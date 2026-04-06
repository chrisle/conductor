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
  { id: 'panel1', label: 'Panel 1', keys: 'Meta+1' },
  { id: 'panel2', label: 'Panel 2', keys: 'Meta+2' },
  { id: 'panel3', label: 'Panel 3', keys: 'Meta+3' },
  { id: 'panel4', label: 'Panel 4', keys: 'Meta+4' },
  { id: 'panel5', label: 'Panel 5', keys: 'Meta+5' },
  { id: 'panel6', label: 'Panel 6', keys: 'Meta+6' },
  { id: 'panel7', label: 'Panel 7', keys: 'Meta+7' },
  { id: 'panel8', label: 'Panel 8', keys: 'Meta+8' },
  { id: 'panel9', label: 'Panel 9', keys: 'Meta+9' },
]

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
