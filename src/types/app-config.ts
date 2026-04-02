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
}

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
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
