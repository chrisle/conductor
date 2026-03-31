export interface JiraConnection {
  id: string
  name: string
  domain: string
  email: string
  apiToken: string
}

export interface AppConfig {
  version: 1
  ui: {
    zoom: number
    kanbanCompactColumns: string[]
  }
  jiraConnections: JiraConnection[]
  aiCli: {
    claudeCode: {
      skipDangerousPermissions: boolean
      autoPilotScanMs: number
      disableBackgroundTasks: boolean
    }
    codex: {
      autoPilotScanMs: number
    }
  }
  terminal: {
    renderer: 'ghostty' | 'xterm'
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
  jiraConnections: [],
  aiCli: {
    claudeCode: {
      skipDangerousPermissions: false,
      autoPilotScanMs: 250,
      disableBackgroundTasks: true,
    },
    codex: {
      autoPilotScanMs: 250,
    },
  },
  terminal: {
    renderer: 'xterm',
  },
  extensions: {
    disabled: [],
  },
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
