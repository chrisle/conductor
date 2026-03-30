import { describe, it, expect, beforeEach } from 'vitest'
import { useConfigStore } from '../store/config'
import {
  loadConfig,
  saveConfig,
  clearConfig,
  issueUrl,
  projectBoardUrl,
  type JiraConfig,
  type JiraProject,
} from '@np3/jira/jira-api'

const testConfig: JiraConfig = {
  domain: 'mycompany',
  email: 'dev@mycompany.com',
  apiToken: 'test-token',
}

describe('loadConfig / saveConfig / clearConfig', () => {
  beforeEach(() => {
    // Reset config store to empty jiraConnections
    useConfigStore.setState({
      config: { ...useConfigStore.getState().config, jiraConnections: [] },
      ready: true,
    })
  })

  it('returns null when no connections exist', () => {
    const config = loadConfig()
    expect(config).toBeNull()
  })

  it('round-trips a saved config', () => {
    saveConfig(testConfig)
    const loaded = loadConfig()
    expect(loaded).toEqual(testConfig)
  })

  it('clears the config', () => {
    saveConfig(testConfig)
    clearConfig()
    const loaded = loadConfig()
    expect(loaded).toBeNull()
  })

  it('updates existing connection on second save', () => {
    saveConfig(testConfig)
    const updated = { ...testConfig, email: 'new@mycompany.com' }
    saveConfig(updated)
    const loaded = loadConfig()
    expect(loaded?.email).toBe('new@mycompany.com')
    expect(useConfigStore.getState().config.jiraConnections.length).toBe(1)
  })
})

describe('issueUrl', () => {
  it('builds the browse URL for an issue key', () => {
    expect(issueUrl(testConfig, 'NP3-42')).toBe(
      'https://mycompany.atlassian.net/browse/NP3-42'
    )
  })

  it('strips trailing .atlassian.net from domain if already present', () => {
    const cfg: JiraConfig = { ...testConfig, domain: 'mycompany.atlassian.net' }
    expect(issueUrl(cfg, 'NP3-1')).toBe(
      'https://mycompany.atlassian.net/browse/NP3-1'
    )
  })
})

describe('projectBoardUrl', () => {
  const makeProject = (overrides: Partial<JiraProject> = {}): JiraProject => ({
    id: '1',
    key: 'NP3',
    name: 'Test Project',
    projectTypeKey: 'software',
    ...overrides,
  })

  it('builds a software board URL with boardId', () => {
    const project = makeProject({ boardId: 99 })
    expect(projectBoardUrl(testConfig, project)).toBe(
      'https://mycompany.atlassian.net/jira/software/projects/NP3/boards/99'
    )
  })

  it('builds a software board URL without boardId', () => {
    const project = makeProject()
    expect(projectBoardUrl(testConfig, project)).toBe(
      'https://mycompany.atlassian.net/jira/software/projects/NP3/board'
    )
  })

  it('builds a service_desk URL', () => {
    const project = makeProject({ projectTypeKey: 'service_desk', boardId: 5 })
    expect(projectBoardUrl(testConfig, project)).toBe(
      'https://mycompany.atlassian.net/jira/servicedesk/projects/NP3/boards/5'
    )
  })

  it('builds a business (core) URL', () => {
    const project = makeProject({ projectTypeKey: 'business' })
    expect(projectBoardUrl(testConfig, project)).toBe(
      'https://mycompany.atlassian.net/jira/core/projects/NP3/board'
    )
  })
})
