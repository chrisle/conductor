import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createDefaultProject, initializeDefaultProject } from '../lib/project-io'
import { useProjectStore } from '../store/project'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore } from '../store/layout'

// Mock killTerminal and electronAPI
vi.mock('../lib/terminal-api', () => ({
  killTerminal: vi.fn(),
}))

describe('new window gets a fresh project', () => {
  beforeEach(() => {
    useProjectStore.setState({
      filePath: null,
      name: null,
      activeWorkspace: null,
      workspaceNames: [],
      dirtyWorkspaces: new Set(),
      recentProjects: [],
      providerProjectKeys: [],
      providerConnectionId: null,
      projectSettings: undefined,
      workspaceSettings: undefined,
      sessionTitles: {},
      sessionFolders: [],
    })
    vi.clearAllMocks()
  })

  it('createDefaultProject produces a fresh project with no file path', () => {
    // Simulate the first window having a loaded project
    useProjectStore.setState({
      filePath: '/some/path/project.conductor',
      name: 'Window 1 Project',
      activeWorkspace: 'dev',
      workspaceNames: ['default', 'dev'],
    })

    // New window calls createDefaultProject (triggered by ?newWindow=1)
    createDefaultProject()

    const state = useProjectStore.getState()
    expect(state.filePath).toBeNull()
    expect(state.name).toBe('Untitled Project')
    expect(state.activeWorkspace).toBe('default')
    expect(state.workspaceNames).toEqual(['default'])
  })

  it('createDefaultProject creates a fresh tab group', () => {
    createDefaultProject()

    const layout = useLayoutStore.getState()
    expect(layout.root).toBeDefined()
    expect(layout.root?.type).toBe('leaf')

    if (layout.root?.type === 'leaf') {
      const groups = useTabsStore.getState().groups
      expect(groups[layout.root.groupId]).toBeDefined()
      expect(groups[layout.root.groupId].tabs).toEqual([])
    }
  })

  it('initializeDefaultProject falls back to default when recent project file is missing', async () => {
    // Mock electronAPI.readFile to simulate missing file
    window.electronAPI = {
      ...window.electronAPI,
      readFile: vi.fn().mockResolvedValue({ success: false }),
    } as any

    useProjectStore.setState({
      recentProjects: [{ name: 'Recent', path: '/recent.conductor' }],
    })

    await initializeDefaultProject()

    // Falls through to create a default project since the file doesn't exist
    const state = useProjectStore.getState()
    expect(state.name).toBe('Untitled Project')
  })
})

describe('newWindow URL parameter detection', () => {
  const originalLocation = window.location

  afterEach(() => {
    // Restore original location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })
  })

  it('detects newWindow=1 in URL search params', () => {
    // Simulate the URL that the main process sets for new windows
    const url = new URL('http://localhost:5173/?newWindow=1')
    const params = new URLSearchParams(url.search)
    expect(params.get('newWindow')).toBe('1')
  })

  it('returns null for newWindow when not present', () => {
    const url = new URL('http://localhost:5173/')
    const params = new URLSearchParams(url.search)
    expect(params.get('newWindow')).toBeNull()
  })

  it('main process URL construction appends newWindow param', () => {
    // Simulate main process URL construction for dev mode
    const devUrl = 'http://localhost:5173'
    const url = new URL(devUrl)
    url.searchParams.set('newWindow', '1')
    expect(url.toString()).toBe('http://localhost:5173/?newWindow=1')
  })
})
