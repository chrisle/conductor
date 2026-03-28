import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  loadConfig,
  saveConfig,
  clearConfig,
  issueUrl,
  projectBoardUrl,
  type JiraConfig,
  type JiraProject,
} from '../extensions/jira/jira-api'

const CONFIG_KEY = 'conductor:jira:config'

const testConfig: JiraConfig = {
  domain: 'mycompany',
  email: 'dev@mycompany.com',
  apiToken: 'test-token',
}

describe('loadConfig / saveConfig / clearConfig', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('returns the default config when nothing is stored', () => {
    const config = loadConfig()
    expect(config).not.toBeNull()
    // Default config always has a domain set
    expect(typeof config!.domain).toBe('string')
  })

  it('round-trips a saved config', () => {
    saveConfig(testConfig)
    const loaded = loadConfig()
    expect(loaded).toEqual(testConfig)
  })

  it('clears the config from localStorage', () => {
    saveConfig(testConfig)
    clearConfig()
    expect(localStorage.getItem(CONFIG_KEY)).toBeNull()
    // After clear, loadConfig falls back to default (not null)
    const loaded = loadConfig()
    expect(loaded).not.toBeNull()
  })

  it('returns default when localStorage contains invalid JSON', () => {
    localStorage.setItem(CONFIG_KEY, '{bad json')
    const loaded = loadConfig()
    expect(loaded).not.toBeNull()
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
