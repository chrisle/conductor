export type ProviderType = 'jira' | 'gitea'

export interface ProviderConnectionBase {
  id: string
  name: string
  providerType: ProviderType
}

export interface JiraProviderConnection extends ProviderConnectionBase {
  providerType: 'jira'
  domain: string
  email: string
  apiToken: string
}

export interface GiteaProviderConnection extends ProviderConnectionBase {
  providerType: 'gitea'
  baseUrl: string
  token: string
  ownerFilter?: string
}

export type ProviderConnection = JiraProviderConnection | GiteaProviderConnection

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
  /**
   * Shell to launch in new terminals. Empty string or 'default' uses the
   * platform default. Well-known values: 'powershell', 'pwsh', 'cmd',
   * 'git-bash' (Windows); 'bash', 'zsh', 'fish' (macOS/Linux). Any other
   * value is treated as a literal path to a shell binary.
   */
  shell: string
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

export interface MarkdownCustomization {
  includeFrontmatter: boolean
  background: 'light' | 'dark'
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
  }
  /** Per-extension preferences. Keyed by extension ID. */
  extensionData: Record<string, Record<string, unknown>>
  /** Last working directory used when opening a new terminal tab */
  lastTerminalCwd?: string
  claudeAccounts: ClaudeAccount[]
  /** ID of the account to use by default for new AI tabs. null = system default (ANTHROPIC_API_KEY env var) */
  defaultClaudeAccountId: string | null
  providerConnections: ProviderConnection[]
  aiCli: {
    claudeCode: {
      allowYoloMode: boolean
      yoloModeByDefault: boolean
      autoPilotScanMs: number
      disableBackgroundTasks: boolean
      agentTeams: boolean
      effortLevelMax: boolean
      disableAdaptiveThinking: boolean
      /** When > 0, sets MAX_THINKING_TOKENS env var. 0 disables. */
      maxThinkingTokens: number
      disable1MContext: boolean
      disableTelemetry: boolean
      startWorkPromptTemplate: string
    }
    codex: {
      autoPilotScanMs: number
    }
  }
  extensions: {
    disabled: string[]
    /** Paths to unpacked extension directories loaded directly from their source location */
    devPaths: string[]
  }
  customization: {
    terminal: TerminalCustomization
    editor: EditorCustomization
    markdown: MarkdownCustomization
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
  shell: 'default',
}

export const DEFAULT_MARKDOWN_CUSTOMIZATION: MarkdownCustomization = {
  includeFrontmatter: false,
  background: 'light',
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

const mod = navigator.userAgent.includes('Mac') ? 'Meta' : 'Ctrl'

export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { id: 'goToFile', label: 'Go to File', keys: `${mod}+g` },
  { id: 'nextTab', label: 'Next Tab', keys: `${mod}+Shift+]` },
  { id: 'prevTab', label: 'Previous Tab', keys: `${mod}+Shift+[` },
  { id: 'toggleSidebar', label: 'Toggle Sidebar', keys: `${mod}+b` },
  { id: 'zoomIn', label: 'Zoom In', keys: `${mod}+=` },
  { id: 'zoomOut', label: 'Zoom Out', keys: `${mod}+-` },
  { id: 'zoomReset', label: 'Reset Zoom', keys: `${mod}+0` },
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
  },
  extensionData: {},
  claudeAccounts: [],
  defaultClaudeAccountId: null,
  providerConnections: [],
  aiCli: {
    claudeCode: {
      allowYoloMode: false,
      yoloModeByDefault: false,
      autoPilotScanMs: 250,
      disableBackgroundTasks: true,
      agentTeams: false,
      effortLevelMax: false,
      disableAdaptiveThinking: false,
      maxThinkingTokens: 63999,
      disable1MContext: false,
      disableTelemetry: false,
      startWorkPromptTemplate: DEFAULT_START_WORK_PROMPT_TEMPLATE,
    },
    codex: {
      autoPilotScanMs: 250,
    },
  },
  extensions: {
    disabled: [],
    devPaths: [],
  },
  customization: {
    terminal: { ...DEFAULT_TERMINAL_CUSTOMIZATION },
    editor: { ...DEFAULT_EDITOR_CUSTOMIZATION },
    markdown: { ...DEFAULT_MARKDOWN_CUSTOMIZATION },
    keyboardShortcuts: [...DEFAULT_KEYBOARD_SHORTCUTS],
  },
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
