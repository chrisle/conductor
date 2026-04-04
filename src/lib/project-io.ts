import { useLayoutStore } from '@/store/layout'
import { useTabsStore } from '@/store/tabs'
import { useSidebarStore } from '@/store/sidebar'
import { useActivityBarStore } from '@/store/activityBar'
import { killTerminal } from '@/lib/terminal-api'
import {
  useProjectStore,
  type ConductorProject,
  type Workspace,
  type SerializedTab
} from '@/store/project'

/**
 * Capture the current terminal scrollback for a given tab.
 * Accessed via a global registry that TerminalTab populates.
 */
const terminalBuffers = new Map<string, () => string>()

export function registerTerminalBuffer(tabId: string, getBuffer: () => string): void {
  terminalBuffers.set(tabId, getBuffer)
}

export function unregisterTerminalBuffer(tabId: string): void {
  terminalBuffers.delete(tabId)
}

/** Serialize the current tab/layout state into a Workspace */
export function serializeWorkspace(): Workspace {
  const layout = useLayoutStore.getState()
  const tabs = useTabsStore.getState()

  const groups: Workspace['groups'] = {}
  for (const [groupId, group] of Object.entries(tabs.groups)) {
    groups[groupId] = {
      id: group.id,
      activeTabId: group.activeTabId,
      worktree: group.worktree,
      tabs: group.tabs.map(tab => {
        const serialized: SerializedTab = {
          id: tab.id,
          type: tab.type,
          title: tab.title,
          filePath: tab.filePath,
          url: tab.url,
          content: tab.content,
        }
        if ((tab.type === 'terminal' || tab.type === 'claude-code' || tab.type === 'codex') && terminalBuffers.has(tab.id)) {
          try {
            serialized.terminalHistory = terminalBuffers.get(tab.id)!()
          } catch {}
        }
        return serialized
      })
    }
  }

  const workspaceSettings = useProjectStore.getState().workspaceSettings
  return {
    layout: layout.root!,
    groups,
    focusedGroupId: layout.focusedGroupId,
    settings: workspaceSettings,
  }
}

/** Serialize the full project (all workspaces) */
export function serializeProject(): ConductorProject {
  const sidebar = useSidebarStore.getState()
  const activityBar = useActivityBarStore.getState()
  const project = useProjectStore.getState()

  // Start from the currently loaded project data (if any) to preserve other workspaces
  let workspaces: Record<string, Workspace> = {}
  const activeWs = project.activeWorkspace || 'default'

  // Build workspaces from existing names
  for (const name of project.workspaceNames) {
    if (name !== activeWs) {
      // Preserve placeholder — actual data stays on disk, loaded on demand
      workspaces[name] = workspaces[name] || { layout: { type: 'leaf', groupId: '__placeholder__' }, groups: {}, focusedGroupId: null }
    }
  }

  // Always serialize current state as the active workspace
  workspaces[activeWs] = serializeWorkspace()

  return {
    version: 3,
    name: project.name || 'Untitled Project',
    activeWorkspace: activeWs,
    workspaces,
    workspaceOrder: project.workspaceNames,
    sidebar: {
      rootPath: sidebar.rootPath,
      expandedPaths: Array.from(sidebar.expandedPaths)
    },
    activeExtensionId: activityBar.activeExtensionId,
    jira: project.jiraSpaceKeys.length > 0 ? {
      spaceKeys: project.jiraSpaceKeys,
      connectionId: project.jiraConnectionId ?? undefined,
    } : undefined,
    settings: project.projectSettings,
    sessionTitles: Object.keys(project.sessionTitles).length > 0 ? project.sessionTitles : undefined,
    sessionFolders: project.sessionFolders.length > 0 ? project.sessionFolders : undefined,
  }
}

const SESSION_TAB_TYPES = new Set(['terminal', 'claude-code', 'codex'])

/** Restore a workspace (tabs + layout) */
async function restoreWorkspace(workspace: Workspace): Promise<void> {
  const tabsStore = useTabsStore.getState()
  const layoutStore = useLayoutStore.getState()

  // Clear current state
  for (const groupId of Object.keys(tabsStore.groups)) {
    for (const tab of tabsStore.groups[groupId].tabs) {
      if (SESSION_TAB_TYPES.has(tab.type)) {
        killTerminal(tab.id)
      }
    }
    tabsStore.removeGroup(groupId)
  }

  // Restore workspace-level settings
  useProjectStore.getState().setWorkspaceSettings(workspace.settings)

  // Fetch live conductord sessions to filter out stale tabs
  let liveSessionIds: Set<string> | null = null
  try {
    const sessions = await window.electronAPI.conductordGetSessions()
    liveSessionIds = new Set(sessions.filter(s => !s.dead).map(s => s.id))
  } catch {
    // If conductord is unreachable, skip filtering
  }

  // Restore groups and tabs, skipping session tabs whose session no longer exists
  const newGroups: Record<string, import('@/store/tabs').TabGroup> = {}
  for (const [groupId, group] of Object.entries(workspace.groups)) {
    const tabs = group.tabs
      .filter(tab => {
        if (liveSessionIds && SESSION_TAB_TYPES.has(tab.type)) {
          return liveSessionIds.has(tab.id)
        }
        return true
      })
      .map(tab => ({
        id: tab.id,
        type: tab.type,
        title: tab.title,
        filePath: tab.filePath,
        url: tab.url,
        content: tab.content,
        _terminalHistory: tab.terminalHistory
      } as any))

    newGroups[groupId] = {
      id: group.id,
      activeTabId: tabs.find(t => t.id === group.activeTabId) ? group.activeTabId : (tabs[0]?.id ?? null),
      worktree: group.worktree,
      tabs,
    }
  }
  useTabsStore.setState({ groups: newGroups })

  // Restore layout
  layoutStore.setRoot(workspace.layout)
  if (workspace.focusedGroupId) {
    layoutStore.setFocusedGroup(workspace.focusedGroupId)
  }
}

/** Restore a full project */
export async function restoreProject(project: ConductorProject, projectDir?: string): Promise<void> {
  const sidebarStore = useSidebarStore.getState()
  const activityBarStore = useActivityBarStore.getState()

  // Restore the active workspace
  const wsName = project.activeWorkspace || Object.keys(project.workspaces)[0]
  const workspace = project.workspaces[wsName]
  if (workspace) {
    await restoreWorkspace(workspace)
  }

  // Restore sidebar — rootPath is set by caller via projectDir param
  if (project.sidebar?.rootPath) {
    sidebarStore.setRootPath(project.sidebar.rootPath)
  } else if (projectDir) {
    sidebarStore.setRootPath(projectDir)
  }
  if (project.sidebar?.expandedPaths) {
    useSidebarStore.setState({
      expandedPaths: new Set(project.sidebar.expandedPaths)
    })
  }

  // Restore activity bar
  if (project.activeExtensionId !== undefined) {
    activityBarStore.setActiveExtension(project.activeExtensionId)
  }

  // Use persisted order if available, fall back to object keys
  const workspaceNames = project.workspaceOrder || Object.keys(project.workspaces)
  const projectStore = useProjectStore.getState()
  projectStore.setActiveWorkspace(wsName)
  projectStore.setWorkspaceNames(workspaceNames)

  // Restore Jira config (v3+)
  if (project.jira) {
    projectStore.setJiraConfig(project.jira.spaceKeys, project.jira.connectionId)
  }

  // Restore settings
  projectStore.setProjectSettings(project.settings)
  const activeWorkspace = project.workspaces[wsName]
  if (activeWorkspace) {
    projectStore.setWorkspaceSettings(activeWorkspace.settings)
  }

  // Restore session titles
  projectStore.setSessionTitles(project.sessionTitles || {})

  // Restore session folders (with backward compat from old sessionGroups)
  if (project.sessionFolders && project.sessionFolders.length > 0) {
    projectStore.setSessionFolders(project.sessionFolders)
  } else if (project.sessionGroups && project.sessionGroups.length > 0) {
    // Migrate old flat groups → folders
    projectStore.setSessionFolders(project.sessionGroups.map(g => ({
      id: g.id,
      name: g.name,
      parentId: null,
      sessionIds: g.sessionIds,
      collapsed: false,
    })))
  } else {
    projectStore.setSessionFolders([])
  }
}

/** Save the current project to the given file path */
export async function saveProject(filePath: string): Promise<void> {
  // Load existing file to preserve other workspaces
  let existingProject: ConductorProject | null = null
  try {
    const result = await window.electronAPI.readFile(filePath)
    if (result.success && result.content) {
      existingProject = JSON.parse(result.content)
    }
  } catch {}

  const project = useProjectStore.getState()
  const activeWs = project.activeWorkspace || 'default'
  const currentWorkspace = serializeWorkspace()
  const sidebar = useSidebarStore.getState()
  const activityBar = useActivityBarStore.getState()

  // Merge: keep other workspaces from disk, update active one
  const workspaces: Record<string, Workspace> = existingProject?.workspaces
    ? { ...existingProject.workspaces }
    : {}
  workspaces[activeWs] = currentWorkspace

  const data: ConductorProject = {
    version: 3,
    name: project.name || 'Untitled Project',
    activeWorkspace: activeWs,
    workspaces,
    workspaceOrder: project.workspaceNames,
    sidebar: {
      rootPath: sidebar.rootPath,
      expandedPaths: Array.from(sidebar.expandedPaths)
    },
    activeExtensionId: activityBar.activeExtensionId,
    jira: project.jiraSpaceKeys.length > 0 ? {
      spaceKeys: project.jiraSpaceKeys,
      connectionId: project.jiraConnectionId ?? undefined,
    } : undefined,
    settings: project.projectSettings,
    sessionTitles: Object.keys(project.sessionTitles).length > 0 ? project.sessionTitles : undefined,
    sessionFolders: project.sessionFolders.length > 0 ? project.sessionFolders : undefined,
  }

  await window.electronAPI.writeFile(filePath, JSON.stringify(data, null, 2))
  // Clear dirty for all workspaces on save
  useProjectStore.setState({ dirtyWorkspaces: new Set() })
  useProjectStore.getState().setWorkspaceNames(project.workspaceNames)
}

/** Save with file picker dialog */
export async function saveProjectAs(): Promise<string | null> {
  const path = await window.electronAPI.saveProjectDialog()
  if (!path) return null
  await saveProject(path)
  const name = path.split('/').pop()?.replace('.conductor', '') || 'Untitled Project'
  useProjectStore.getState().setProject(path, name)
  return path
}

/** Open a project from file picker dialog */
export async function openProjectDialog(): Promise<boolean> {
  const path = await window.electronAPI.openProjectDialog()
  if (!path) return false
  return openProject(path)
}

/** Open a project from a specific file path */
export async function openProject(filePath: string): Promise<boolean> {
  const result = await window.electronAPI.readFile(filePath)
  if (!result.success || !result.content) return false

  const projectDir = filePath.replace(/\/[^/]+$/, '')

  try {
    const raw = JSON.parse(result.content)

    const fileBaseName = filePath.split('/').pop()?.replace('.conductor', '') || 'Untitled Project'

    // Handle v1 format (single workspace)
    if (raw.version === 1) {
      const project: ConductorProject = {
        version: 3,
        name: raw.name || fileBaseName,
        activeWorkspace: 'default',
        workspaces: {
          default: {
            layout: raw.layout,
            groups: raw.groups,
            focusedGroupId: raw.focusedGroupId
          }
        },
        sidebar: raw.sidebar,
        activeExtensionId: raw.activeExtensionId
      }
      await restoreProject(project, projectDir)
      useProjectStore.getState().setProject(filePath, project.name)
      return true
    }

    // v2 format
    const project: ConductorProject = raw
    if (!project.workspaces || Object.keys(project.workspaces).length === 0) {
      console.error('Invalid .conductor file: no workspaces')
      return false
    }

    await restoreProject(project, projectDir)
    useProjectStore.getState().setProject(filePath, project.name || fileBaseName)
    return true
  } catch (err) {
    console.error('Failed to parse .conductor file:', err)
    return false
  }
}

/** Switch to a different workspace within the current project */
export async function switchWorkspace(workspaceName: string): Promise<boolean> {
  const project = useProjectStore.getState()

  // If project is saved to disk, save current workspace first
  if (project.filePath) {
    await saveProject(project.filePath)
  }

  // For unsaved projects, just store current workspace in memory
  // (we lose it on switch — this is expected for unsaved projects)

  if (project.filePath) {
    // Load the project file to get the target workspace
    const result = await window.electronAPI.readFile(project.filePath)
    if (!result.success || !result.content) return false

    try {
      const data: ConductorProject = JSON.parse(result.content)
      const workspace = data.workspaces[workspaceName]
      if (!workspace) return false

      await restoreWorkspace(workspace)
    } catch {
      return false
    }
  } else {
    // For unsaved projects, create a fresh empty workspace
    const tabsStore = useTabsStore.getState()
    const layoutStore = useLayoutStore.getState()

    // Clear current state
    for (const groupId of Object.keys(tabsStore.groups)) {
      for (const tab of tabsStore.groups[groupId].tabs) {
        if (tab.type === 'terminal' || tab.type === 'claude-code' || tab.type === 'codex') {
          killTerminal(tab.id)
        }
      }
      tabsStore.removeGroup(groupId)
    }

    // Create fresh group
    const groupId = tabsStore.createGroup()
    layoutStore.setRoot({ type: 'leaf', groupId })
    layoutStore.setFocusedGroup(groupId)
  }

  useProjectStore.getState().setActiveWorkspace(workspaceName)
  useProjectStore.getState().clearWorkspaceDirty(workspaceName)
  return true
}

/** Generate a unique "Untitled Workspace" name */
export function generateWorkspaceName(existingNames: string[]): string {
  const base = 'Untitled Workspace'
  if (!existingNames.includes(base)) return base
  let i = 2
  while (existingNames.includes(`${base} ${i}`)) i++
  return `${base} ${i}`
}

/** Add a new empty workspace and switch to it */
export async function addWorkspace(workspaceName?: string): Promise<boolean> {
  const project = useProjectStore.getState()
  const name = workspaceName || generateWorkspaceName(project.workspaceNames)

  if (project.workspaceNames.includes(name)) return false

  // If saved to disk, save current workspace first
  if (project.filePath) {
    await saveProject(project.filePath)
  }

  // Add the new workspace name
  const newNames = [...project.workspaceNames, name]
  useProjectStore.getState().setWorkspaceNames(newNames)

  // Clear current tabs and create a fresh empty workspace
  const tabsStore = useTabsStore.getState()
  const layoutStore = useLayoutStore.getState()

  for (const groupId of Object.keys(tabsStore.groups)) {
    for (const tab of tabsStore.groups[groupId].tabs) {
      if (tab.type === 'terminal' || tab.type === 'claude-code' || tab.type === 'codex') {
        killTerminal(tab.id)
      }
    }
    tabsStore.removeGroup(groupId)
  }

  const groupId = tabsStore.createGroup()
  layoutStore.setRoot({ type: 'leaf', groupId })
  layoutStore.setFocusedGroup(groupId)

  useProjectStore.getState().setActiveWorkspace(name)

  // If saved to disk, save the new empty workspace
  if (project.filePath) {
    await saveProject(project.filePath)
  }

  return true
}

/** Delete a workspace from the current project */
export async function deleteWorkspace(workspaceName: string): Promise<boolean> {
  const project = useProjectStore.getState()
  if (project.workspaceNames.length <= 1) return false // can't delete the only workspace

  // If deleting the active workspace, switch to another one first
  if (project.activeWorkspace === workspaceName) {
    const other = project.workspaceNames.find(n => n !== workspaceName)
    if (!other) return false
    await switchWorkspace(other)
  }

  if (project.filePath) {
    const result = await window.electronAPI.readFile(project.filePath)
    if (!result.success || !result.content) return false

    try {
      const data: ConductorProject = JSON.parse(result.content)
      delete data.workspaces[workspaceName]
      data.workspaceOrder = (data.workspaceOrder || Object.keys(data.workspaces)).filter(n => n !== workspaceName)
      await window.electronAPI.writeFile(project.filePath, JSON.stringify(data, null, 2))
    } catch {
      return false
    }
  }

  const newNames = project.workspaceNames.filter(n => n !== workspaceName)
  useProjectStore.getState().setWorkspaceNames(newNames)
  useProjectStore.getState().clearWorkspaceDirty(workspaceName)
  return true
}

/** Rename a workspace */
export async function renameWorkspace(oldName: string, newName: string): Promise<boolean> {
  const project = useProjectStore.getState()
  const trimmed = newName.trim()
  if (!trimmed || trimmed === oldName) return false
  if (project.workspaceNames.includes(trimmed)) return false

  if (project.filePath) {
    const result = await window.electronAPI.readFile(project.filePath)
    if (!result.success || !result.content) return false

    try {
      const data: ConductorProject = JSON.parse(result.content)
      if (data.workspaces[oldName]) {
        data.workspaces[trimmed] = data.workspaces[oldName]
        delete data.workspaces[oldName]
      }
      if (data.activeWorkspace === oldName) {
        data.activeWorkspace = trimmed
      }
      if (data.workspaceOrder) {
        data.workspaceOrder = data.workspaceOrder.map(n => n === oldName ? trimmed : n)
      }
      await window.electronAPI.writeFile(project.filePath, JSON.stringify(data, null, 2))
    } catch {
      return false
    }
  }

  useProjectStore.getState().renameWorkspaceInStore(oldName, trimmed)
  return true
}

/** Rename the current project (display name only, does not rename the file) */
export async function renameProject(newName: string): Promise<boolean> {
  const trimmed = newName.trim()
  if (!trimmed) return false

  const project = useProjectStore.getState()
  useProjectStore.getState().setName(trimmed)

  if (project.filePath) {
    try {
      const result = await window.electronAPI.readFile(project.filePath)
      if (result.success && result.content) {
        const data: ConductorProject = JSON.parse(result.content)
        data.name = trimmed
        await window.electronAPI.writeFile(project.filePath, JSON.stringify(data, null, 2))
      }
    } catch {
      // Name is updated in memory even if disk write fails
    }
  }

  return true
}

/** Create a brand new project file and open it */
export async function createNewProject(projectName: string, directory: string): Promise<boolean> {
  const filePath = `${directory}/${projectName}.conductor`

  const data: ConductorProject = {
    version: 3,
    name: projectName,
    activeWorkspace: 'default',
    workspaces: {
      default: serializeWorkspace()
    },
    workspaceOrder: ['default'],
    sidebar: {
      rootPath: directory,
      expandedPaths: []
    },
    activeExtensionId: null,
  }

  const result = await window.electronAPI.writeFile(filePath, JSON.stringify(data, null, 2))
  if (!result.success) return false

  useSidebarStore.getState().setRootPath(directory)
  useProjectStore.getState().setProject(filePath, projectName)
  useProjectStore.getState().setActiveWorkspace('default')
  useProjectStore.getState().setWorkspaceNames(['default'])
  return true
}

// --- Auto-save layout to localStorage (for unsaved projects) ---
const AUTOSAVE_KEY = 'conductor:autosave-layout'

export function autosaveLayout(): void {
  try {
    const sidebar = useSidebarStore.getState()
    const activityBar = useActivityBarStore.getState()
    const project = useProjectStore.getState()
    const data = {
      workspace: serializeWorkspace(),
      sidebar: {
        rootPath: sidebar.rootPath,
        expandedPaths: Array.from(sidebar.expandedPaths),
      },
      activeExtensionId: activityBar.activeExtensionId,
      sessionTitles: Object.keys(project.sessionTitles).length > 0 ? project.sessionTitles : undefined,
      sessionFolders: project.sessionFolders.length > 0 ? project.sessionFolders : undefined,
    }
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data))
  } catch { /* quota exceeded — ignore */ }
}

async function restoreAutosavedLayout(): Promise<boolean> {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return false
    const data = JSON.parse(raw)
    if (!data.workspace?.layout || !data.workspace?.groups) return false

    const project: ConductorProject = {
      version: 3,
      name: 'Untitled Project',
      activeWorkspace: 'default',
      workspaces: { default: data.workspace },
      workspaceOrder: ['default'],
      sidebar: data.sidebar || { rootPath: null, expandedPaths: [] },
      activeExtensionId: data.activeExtensionId ?? null,
      sessionTitles: data.sessionTitles,
      sessionFolders: data.sessionFolders,
      sessionGroups: data.sessionGroups,
    }
    await restoreProject(project)
    return true
  } catch { return false }
}

/** Initialize a default in-memory project if none is loaded */
export async function initializeDefaultProject(): Promise<void> {
  const project = useProjectStore.getState()
  if (project.filePath || project.name) return // already loaded

  // Try to reopen the last project
  await useProjectStore.getState().loadRecentProjects()
  const recent = useProjectStore.getState().recentProjects
  if (recent.length > 0) {
    const opened = await openProject(recent[0].path)
    if (opened) return
  }

  // Try to restore the last autosaved layout
  if (await restoreAutosavedLayout()) {
    useProjectStore.setState({
      name: 'Untitled Project',
      activeWorkspace: 'default',
      workspaceNames: ['default'],
    })
    return
  }

  const wsName = 'Untitled Workspace'
  useProjectStore.setState({
    name: 'Untitled Project',
    activeWorkspace: wsName,
    workspaceNames: [wsName]
  })
}
