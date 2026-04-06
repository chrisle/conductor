import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createDefaultProject } from '../lib/project-io'
import { useProjectStore } from '../store/project'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore } from '../store/layout'
import { useSidebarStore } from '../store/sidebar'
import { useActivityBarStore } from '../store/activityBar'

// Mock killTerminal since it depends on electronAPI
vi.mock('../lib/terminal-api', () => ({
  killTerminal: vi.fn(),
}))

function seedProjectState() {
  useProjectStore.setState({
    filePath: '/some/path/project.conductor',
    name: 'Existing Project',
    activeWorkspace: 'dev',
    workspaceNames: ['default', 'dev'],
    dirtyWorkspaces: new Set(['dev']),
    jiraSpaceKeys: ['PROJ'],
    jiraConnectionId: 'conn-1',
    projectSettings: { terminal: {} },
    workspaceSettings: { terminal: {} },
    sessionTitles: { 'tab-1': 'My Session' },
    sessionFolders: [{ id: 'f1', name: 'Folder', parentId: null, sessionIds: ['s1'], collapsed: false }],
  })
  useSidebarStore.setState({ rootPath: '/some/path' })
  useActivityBarStore.getState().setActiveExtension('ext-1')
}

describe('createDefaultProject', () => {
  beforeEach(() => {
    // Reset all stores
    useProjectStore.setState({
      filePath: null,
      name: null,
      activeWorkspace: null,
      workspaceNames: [],
      dirtyWorkspaces: new Set(),
      recentProjects: [],
      jiraSpaceKeys: [],
      jiraConnectionId: null,
      projectSettings: undefined,
      workspaceSettings: undefined,
      sessionTitles: {},
      sessionFolders: [],
    })
    vi.clearAllMocks()
  })

  it('sets the project name to "Untitled Project"', () => {
    createDefaultProject()
    expect(useProjectStore.getState().name).toBe('Untitled Project')
  })

  it('sets the active workspace to "default"', () => {
    createDefaultProject()
    expect(useProjectStore.getState().activeWorkspace).toBe('default')
  })

  it('sets workspace names to ["default"]', () => {
    createDefaultProject()
    expect(useProjectStore.getState().workspaceNames).toEqual(['default'])
  })

  it('clears the file path (project is unsaved/in-memory)', () => {
    seedProjectState()
    createDefaultProject()
    expect(useProjectStore.getState().filePath).toBeNull()
  })

  it('clears dirty workspaces', () => {
    seedProjectState()
    createDefaultProject()
    expect(useProjectStore.getState().dirtyWorkspaces.size).toBe(0)
  })

  it('clears Jira config', () => {
    seedProjectState()
    createDefaultProject()
    expect(useProjectStore.getState().jiraSpaceKeys).toEqual([])
    expect(useProjectStore.getState().jiraConnectionId).toBeNull()
  })

  it('clears project and workspace settings', () => {
    seedProjectState()
    createDefaultProject()
    expect(useProjectStore.getState().projectSettings).toBeUndefined()
    expect(useProjectStore.getState().workspaceSettings).toBeUndefined()
  })

  it('clears session titles and folders', () => {
    seedProjectState()
    createDefaultProject()
    expect(useProjectStore.getState().sessionTitles).toEqual({})
    expect(useProjectStore.getState().sessionFolders).toEqual([])
  })

  it('resets sidebar root path to null', () => {
    seedProjectState()
    createDefaultProject()
    expect(useSidebarStore.getState().rootPath).toBeNull()
  })

  it('clears the active extension', () => {
    seedProjectState()
    createDefaultProject()
    expect(useActivityBarStore.getState().activeExtensionId).toBeNull()
  })

  it('creates a fresh tab group in the layout', () => {
    createDefaultProject()
    const layout = useLayoutStore.getState()
    expect(layout.root).toBeDefined()
    expect(layout.root?.type).toBe('leaf')
    if (layout.root?.type === 'leaf') {
      expect(layout.root.groupId).toBeTruthy()
      // The new group should exist in the tabs store
      const groups = useTabsStore.getState().groups
      expect(groups[layout.root.groupId]).toBeDefined()
      expect(groups[layout.root.groupId].tabs).toEqual([])
    }
  })

  it('does not persist to disk (no filePath set)', () => {
    createDefaultProject()
    expect(useProjectStore.getState().filePath).toBeNull()
  })

  it('preserves recent projects list', () => {
    useProjectStore.setState({
      recentProjects: [{ name: 'Old', path: '/old.conductor' }],
    })
    createDefaultProject()
    // Recent projects should not be cleared — they are independent of the active project
    expect(useProjectStore.getState().recentProjects).toEqual([
      { name: 'Old', path: '/old.conductor' },
    ])
  })
})
