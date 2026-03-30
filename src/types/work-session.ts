export interface WorkSession {
  id: string
  projectPath: string
  ticketKey: string
  jiraConnectionId: string
  worktree: {
    path: string
    branch: string
    baseBranch: string
  } | null
  tmuxSessionId: string | null
  claudeSessionId: string | null
  prUrl: string | null
  status: 'active' | 'completed'
  createdAt: string
  updatedAt: string
}

export interface WorkSessionsFile {
  version: 1
  sessions: WorkSession[]
}
