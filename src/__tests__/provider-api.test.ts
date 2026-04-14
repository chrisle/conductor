import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useConfigStore } from '../store/config'
import type { JiraProviderConnection } from '../types/app-config'

const testConnection: JiraProviderConnection = {
  id: 'test-jira',
  name: 'mycompany',
  providerType: 'jira',
  domain: 'mycompany',
  email: 'dev@mycompany.com',
  apiToken: 'test-token',
}

describe('provider connection management', () => {
  beforeEach(() => {
    useConfigStore.setState({
      config: { ...useConfigStore.getState().config, providerConnections: [] },
      ready: true,
    })
  })

  it('returns null when no connections exist', () => {
    const conn = useConfigStore.getState().getActiveConnection()
    expect(conn).toBeNull()
  })

  it('round-trips a saved connection', async () => {
    await useConfigStore.getState().addProviderConnection(testConnection)
    const loaded = useConfigStore.getState().getActiveConnection()
    expect(loaded).toEqual(testConnection)
  })

  it('removes a connection', async () => {
    await useConfigStore.getState().addProviderConnection(testConnection)
    await useConfigStore.getState().removeProviderConnection(testConnection.id)
    const loaded = useConfigStore.getState().getActiveConnection()
    expect(loaded).toBeNull()
  })

  it('updates existing connection', async () => {
    await useConfigStore.getState().addProviderConnection(testConnection)
    await useConfigStore.getState().updateProviderConnection(testConnection.id, { name: 'Updated' })
    const loaded = useConfigStore.getState().getActiveConnection()
    expect(loaded?.name).toBe('Updated')
    expect(useConfigStore.getState().config.providerConnections.length).toBe(1)
  })

  it('getActiveConnection filters by provider type', async () => {
    await useConfigStore.getState().addProviderConnection(testConnection)
    expect(useConfigStore.getState().getActiveConnection('jira')?.id).toBe('test-jira')
    expect(useConfigStore.getState().getActiveConnection('gitea')).toBeNull()
  })

  it('getConnectionById returns the matching connection', async () => {
    await useConfigStore.getState().addProviderConnection(testConnection)
    expect(useConfigStore.getState().getConnectionById('test-jira')?.name).toBe('mycompany')
    expect(useConfigStore.getState().getConnectionById('nonexistent')).toBeNull()
  })
})

describe('createJiraTicket via provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses issue type ID when createmeta resolves successfully', async () => {
    ;(window.electronAPI as any).httpFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        values: [
          { id: '10001', name: 'Task', subtask: false },
          { id: '10002', name: 'Bug', subtask: false },
        ],
      },
    })

    let capturedBody: any = null
    ;(window.electronAPI as any).httpPost = vi.fn().mockImplementation(
      async (_url: string, _headers: any, body: string) => {
        capturedBody = JSON.parse(body)
        return { ok: true, status: 201, body: { id: '10100', key: 'NP3-1' } }
      },
    )

    // Import dynamically to get the provider after mocks are set up
    const { providerRegistry } = await import('@kanban-extension/providers/provider')
    await import('@kanban-extension/providers/jira/jira-provider')

    const provider = providerRegistry.get('jira')
    await provider.createTicket(testConnection, {
      projectKey: 'NP3',
      summary: 'Test ticket',
      description: 'Test description',
      issueType: 'Task',
    })

    expect(capturedBody.fields.issuetype).toEqual({ id: '10001' })
  })

  it('falls back to issue type name when createmeta endpoint returns 404 (CON-75)', async () => {
    ;(window.electronAPI as any).httpFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      body: null,
    })

    let capturedBody: any = null
    ;(window.electronAPI as any).httpPost = vi.fn().mockImplementation(
      async (_url: string, _headers: any, body: string) => {
        capturedBody = JSON.parse(body)
        return { ok: true, status: 201, body: { id: '10100', key: 'NP3-1' } }
      },
    )

    const { providerRegistry } = await import('@kanban-extension/providers/provider')
    await import('@kanban-extension/providers/jira/jira-provider')

    const provider = providerRegistry.get('jira')
    await provider.createTicket(testConnection, {
      projectKey: 'NP3',
      summary: 'Test ticket',
      description: 'Test description',
      issueType: 'Task',
    })

    expect(capturedBody.fields.issuetype).toEqual({ name: 'Task' })
    expect(capturedBody.fields.issuetype.id).toBeUndefined()
  })
})
