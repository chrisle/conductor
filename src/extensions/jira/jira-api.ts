// ── Config ──────────────────────────────────────────────────────────────────

export interface JiraConfig {
  domain: string   // e.g. "triodeofficial" for triodeofficial.atlassian.net
  email: string
  apiToken: string
}

const CONFIG_KEY = 'conductor:jira:config'

const DEFAULT_CONFIG: JiraConfig = {
  domain: 'triodeofficial',
  email: 'REMOVED_EMAIL',
  apiToken: 'REMOVED_SECRET',
}

export function loadConfig(): JiraConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return DEFAULT_CONFIG
    return JSON.parse(raw)
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveConfig(config: JiraConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function clearConfig(): void {
  localStorage.removeItem(CONFIG_KEY)
}

function baseUrl(config: JiraConfig): string {
  const d = config.domain.replace(/\.atlassian\.net$/, '')
  return `https://${d}.atlassian.net`
}

function authHeaders(config: JiraConfig): Record<string, string> {
  return {
    Authorization: 'Basic ' + btoa(`${config.email}:${config.apiToken}`),
    Accept: 'application/json',
  }
}

// ── Shared fetch helper ─────────────────────────────────────────────────────

async function jiraGet(config: JiraConfig, path: string): Promise<unknown> {
  const res = await window.electronAPI.jiraFetch(
    `${baseUrl(config)}${path}`,
    authHeaders(config),
  )
  if (!res.ok) throw new Error(`Jira API ${res.status}${res.error ? `: ${res.error}` : ''}`)
  return res.body
}

// ── Projects ────────────────────────────────────────────────────────────────

export interface JiraProject {
  id: string
  key: string
  name: string
  projectTypeKey: string
  avatarUrl?: string
  boardId?: number
}

export async function fetchProjects(config: JiraConfig): Promise<JiraProject[]> {
  const data = await jiraGet(config, '/rest/api/3/project/search?maxResults=100&orderBy=name') as {
    values?: Array<Record<string, unknown>>
  }
  const projects = (data.values || []).map((p) => ({
    id: p.id as string,
    key: p.key as string,
    name: p.name as string,
    projectTypeKey: p.projectTypeKey as string,
    avatarUrl: (p.avatarUrls as Record<string, string>)?.['24x24'],
  }))

  // Fetch board IDs in parallel
  const withBoards = await Promise.all(
    projects.map(async (p) => {
      try {
        const boardData = await jiraGet(config,
          `/rest/agile/1.0/board?projectKeyOrId=${p.key}&maxResults=1`
        ) as { values?: Array<{ id: number }> }
        return { ...p, boardId: boardData.values?.[0]?.id }
      } catch {
        return p
      }
    })
  )

  return withBoards
}

export function projectBoardUrl(config: JiraConfig, project: JiraProject): string {
  const base = baseUrl(config)
  const boardSuffix = project.boardId ? `boards/${project.boardId}` : 'board'
  switch (project.projectTypeKey) {
    case 'service_desk':
      return `${base}/jira/servicedesk/projects/${project.key}/${boardSuffix}`
    case 'business':
      return `${base}/jira/core/projects/${project.key}/${boardSuffix}`
    default:
      return `${base}/jira/software/projects/${project.key}/${boardSuffix}`
  }
}

// ── Tickets & Epics ─────────────────────────────────────────────────────────

export type TicketStatus = 'backlog' | 'in_progress' | 'done'

export interface Epic {
  key: string
  summary: string
  status: string | null
}

export interface PullRequest {
  id: string
  url: string
  name: string
  status: string
}

export interface Ticket {
  key: string
  summary: string
  status: TicketStatus
  jiraStatus: string
  issueType: string
  priority: string | null
  storyPoints: number | null
  epicKey: string | null
  updatedAt: string
  pullRequests: PullRequest[]
  epic?: Epic
}

function mapStatus(jiraStatus: string): TicketStatus {
  const s = jiraStatus.toLowerCase()
  if (s === 'done' || s === 'closed' || s === 'in review' || s === 'review' || s === 'in qa' || s === 'validate') return 'done'
  if (s === 'in progress' || s === 'in development') return 'in_progress'
  return 'backlog'
}

interface JiraSearchResult {
  issues: Array<{
    id: string
    key: string
    fields: {
      summary: string
      status: { name: string }
      issuetype: { name: string }
      priority?: { name: string }
      parent?: { key: string }
      customfield_10016?: number
      updated: string
    }
  }>
  nextPageToken?: string
  isLast: boolean
}

// Store issue IDs for PR lookup
const issueIdMap = new Map<string, string>()

export async function fetchTickets(config: JiraConfig, projectKey: string): Promise<Ticket[]> {
  const tickets: Ticket[] = []
  let pageToken: string | undefined

  while (true) {
    const params = new URLSearchParams({
      jql: `project=${projectKey} AND issuetype!=Epic ORDER BY key ASC`,
      fields: 'summary,status,issuetype,priority,parent,customfield_10016,updated',
      maxResults: '50',
    })
    if (pageToken) params.set('nextPageToken', pageToken)

    const result = await jiraGet(config, `/rest/api/3/search/jql?${params}`) as JiraSearchResult

    for (const issue of result.issues) {
      issueIdMap.set(issue.key, issue.id)
      tickets.push({
        key: issue.key,
        summary: issue.fields.summary,
        status: mapStatus(issue.fields.status.name),
        jiraStatus: issue.fields.status.name,
        issueType: issue.fields.issuetype.name,
        priority: issue.fields.priority?.name ?? null,
        storyPoints: issue.fields.customfield_10016 != null
          ? Math.round(issue.fields.customfield_10016)
          : null,
        epicKey: issue.fields.parent?.key ?? null,
        updatedAt: issue.fields.updated,
        pullRequests: [],
      })
    }

    if (result.isLast || !result.nextPageToken) break
    pageToken = result.nextPageToken
  }

  return tickets
}

export async function fetchEpics(config: JiraConfig, projectKey: string): Promise<Epic[]> {
  const result = await jiraGet(config, `/rest/api/3/search/jql?${new URLSearchParams({
    jql: `project=${projectKey} AND issuetype=Epic ORDER BY key ASC`,
    fields: 'summary,status',
  })}`) as JiraSearchResult

  return result.issues.map((issue) => ({
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
  }))
}

export async function fetchDevelopmentInfo(config: JiraConfig, issueKey: string): Promise<PullRequest[]> {
  const issueId = issueIdMap.get(issueKey)
  if (!issueId) return []

  try {
    const data = await jiraGet(config,
      `/rest/dev-status/1.0/issue/detail?issueId=${issueId}&applicationType=GitHub&dataType=pullrequest`
    ) as {
      detail?: Array<{ pullRequests?: Array<{ id: string; url: string; name: string; status: string }> }>
    }

    const prMap = new Map<string, PullRequest>()
    for (const detail of data.detail ?? []) {
      for (const pr of detail.pullRequests ?? []) {
        if (pr.status === 'OPEN' || pr.status === 'MERGED') {
          prMap.set(pr.url, { id: pr.id, url: pr.url, name: pr.name, status: pr.status })
        }
      }
    }
    return Array.from(prMap.values())
  } catch {
    return []
  }
}

// ── Transitions ─────────────────────────────────────────────────────────────

async function jiraPost(config: JiraConfig, path: string, body: unknown): Promise<unknown> {
  const res = await window.electronAPI.jiraPost(
    `${baseUrl(config)}${path}`,
    { ...authHeaders(config), 'Content-Type': 'application/json' },
    JSON.stringify(body),
  )
  if (!res.ok) throw new Error(`Jira API ${res.status}${res.error ? `: ${res.error}` : ''}`)
  return res.body
}

export async function transitionTicket(config: JiraConfig, issueKey: string, targetStatus: string): Promise<void> {
  // Get available transitions
  const data = await jiraGet(config, `/rest/api/3/issue/${issueKey}/transitions`) as {
    transitions: Array<{ id: string; name: string; to: { name: string } }>
  }

  const target = targetStatus.toLowerCase()
  const transition = data.transitions.find(
    (t) => t.to.name.toLowerCase() === target || t.name.toLowerCase() === target
  )

  if (!transition) {
    const available = data.transitions.map((t) => `${t.name} → ${t.to.name}`).join(', ')
    throw new Error(`No transition to "${targetStatus}" for ${issueKey}. Available: ${available}`)
  }

  await jiraPost(config, `/rest/api/3/issue/${issueKey}/transitions`, {
    transition: { id: transition.id },
  })
}

// ── Create ticket ────────────────────────────────────────────────────────────

export interface CreateTicketParams {
  projectKey: string
  summary: string
  description: string
  issueType?: string       // defaults to 'Task'
  epicKey?: string | null   // parent epic
  status?: TicketStatus     // desired initial status
}

export async function createJiraTicket(config: JiraConfig, params: CreateTicketParams): Promise<Ticket> {
  const fields: Record<string, unknown> = {
    project: { key: params.projectKey },
    summary: params.summary,
    description: {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: params.description }],
        },
      ],
    },
    issuetype: { name: params.issueType || 'Task' },
  }

  if (params.epicKey) {
    fields.parent = { key: params.epicKey }
  }

  const result = await jiraPost(config, '/rest/api/3/issue', { fields }) as {
    id: string
    key: string
  }

  const ticket: Ticket = {
    key: result.key,
    summary: params.summary,
    status: 'backlog',
    jiraStatus: 'Backlog',
    issueType: params.issueType || 'Task',
    priority: null,
    storyPoints: null,
    epicKey: params.epicKey ?? null,
    updatedAt: new Date().toISOString(),
    pullRequests: [],
  }

  // If we need a status other than backlog, transition it
  if (params.status && params.status !== 'backlog') {
    const statusName = params.status === 'in_progress' ? 'In Progress'
      : params.status === 'done' ? 'Done'
      : 'Backlog'
    try {
      await transitionTicket(config, result.key, statusName)
      ticket.status = params.status
      ticket.jiraStatus = statusName
    } catch {
      // Transition may not be available, ticket stays in backlog
    }
  }

  return ticket
}

// ── URLs ────────────────────────────────────────────────────────────────────

export function issueUrl(config: JiraConfig, key: string): string {
  return `${baseUrl(config)}/browse/${key}`
}
