import { useLayoutStore } from '@/store/layout'
import { useTabsStore } from '@/store/tabs'
import { useSidebarStore } from '@/store/sidebar'
import { useActivityBarStore } from '@/store/activityBar'
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
          initialCommand: tab.initialCommand
        }
        if ((tab.type === 'terminal' || tab.type === 'claude') && terminalBuffers.has(tab.id)) {
          try {
            serialized.terminalHistory = terminalBuffers.get(tab.id)!()
          } catch {}
        }
        return serialized
      })
    }
  }

  return {
    layout: layout.root!,
    groups,
    focusedGroupId: layout.focusedGroupId
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

  // Try to load existing project to preserve other workspaces
  if (project.filePath) {
    try {
      // We'll merge the current workspace into the existing file on save
      // For now, just use what we have in memory
    } catch {}
  }

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
    version: 2,
    name: project.name || 'Untitled',
    activeWorkspace: activeWs,
    workspaces,
    sidebar: {
      rootPath: sidebar.rootPath,
      expandedPaths: Array.from(sidebar.expandedPaths)
    },
    activeExtensionId: activityBar.activeExtensionId
  }
}

/** Restore a workspace (tabs + layout) */
function restoreWorkspace(workspace: Workspace): void {
  const tabsStore = useTabsStore.getState()
  const layoutStore = useLayoutStore.getState()

  // Clear current state
  for (const groupId of Object.keys(tabsStore.groups)) {
    for (const tab of tabsStore.groups[groupId].tabs) {
      if (tab.type === 'terminal' || tab.type === 'claude') {
        window.electronAPI.killTerminal(tab.id)
      }
    }
    tabsStore.removeGroup(groupId)
  }

  // Restore groups and tabs
  const newGroups: Record<string, import('@/store/tabs').TabGroup> = {}
  for (const [groupId, group] of Object.entries(workspace.groups)) {
    newGroups[groupId] = {
      id: group.id,
      activeTabId: group.activeTabId,
      worktree: group.worktree,
      tabs: group.tabs.map(tab => ({
        id: tab.id,
        type: tab.type,
        title: tab.title,
        filePath: tab.filePath,
        url: tab.url,
        initialCommand: tab.initialCommand,
        _terminalHistory: tab.terminalHistory
      } as any))
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
export function restoreProject(project: ConductorProject): void {
  const sidebarStore = useSidebarStore.getState()
  const activityBarStore = useActivityBarStore.getState()

  // Restore the active workspace
  const wsName = project.activeWorkspace || Object.keys(project.workspaces)[0]
  const workspace = project.workspaces[wsName]
  if (workspace) {
    restoreWorkspace(workspace)
  }

  // Restore sidebar
  if (project.sidebar?.rootPath) {
    sidebarStore.setRootPath(project.sidebar.rootPath)
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

  // Update project store with workspace info
  useProjectStore.getState().setActiveWorkspace(wsName)
  useProjectStore.getState().setWorkspaceNames(Object.keys(project.workspaces))
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
    version: 2,
    name: project.name || 'Untitled',
    activeWorkspace: activeWs,
    workspaces,
    sidebar: {
      rootPath: sidebar.rootPath,
      expandedPaths: Array.from(sidebar.expandedPaths)
    },
    activeExtensionId: activityBar.activeExtensionId
  }

  await window.electronAPI.writeFile(filePath, JSON.stringify(data, null, 2))
  useProjectStore.getState().setDirty(false)
  useProjectStore.getState().setWorkspaceNames(Object.keys(workspaces))
}

/** Save with file picker dialog */
export async function saveProjectAs(): Promise<string | null> {
  const path = await window.electronAPI.saveProjectDialog()
  if (!path) return null
  await saveProject(path)
  const name = path.split('/').pop()?.replace('.conductor', '') || 'Untitled'
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

  try {
    const raw = JSON.parse(result.content)

    // Handle v1 format (single workspace)
    if (raw.version === 1) {
      const project: ConductorProject = {
        version: 2,
        name: raw.name,
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
      restoreProject(project)
      const name = filePath.split('/').pop()?.replace('.conductor', '') || 'Untitled'
      useProjectStore.getState().setProject(filePath, name)
      return true
    }

    // v2 format
    const project: ConductorProject = raw
    if (!project.workspaces || Object.keys(project.workspaces).length === 0) {
      console.error('Invalid .conductor file: no workspaces')
      return false
    }

    restoreProject(project)
    const name = filePath.split('/').pop()?.replace('.conductor', '') || 'Untitled'
    useProjectStore.getState().setProject(filePath, name)
    return true
  } catch (err) {
    console.error('Failed to parse .conductor file:', err)
    return false
  }
}

/** Switch to a different workspace within the current project */
export async function switchWorkspace(workspaceName: string): Promise<boolean> {
  const project = useProjectStore.getState()
  if (!project.filePath) return false

  // Save current workspace first
  await saveProject(project.filePath)

  // Load the project file to get the target workspace
  const result = await window.electronAPI.readFile(project.filePath)
  if (!result.success || !result.content) return false

  try {
    const data: ConductorProject = JSON.parse(result.content)
    const workspace = data.workspaces[workspaceName]
    if (!workspace) return false

    restoreWorkspace(workspace)
    useProjectStore.getState().setActiveWorkspace(workspaceName)
    useProjectStore.getState().setDirty(false)
    return true
  } catch {
    return false
  }
}

/** Add a new workspace to the current project (saves current state as the new workspace) */
export async function addWorkspace(workspaceName: string): Promise<boolean> {
  const project = useProjectStore.getState()
  if (!project.filePath) return false

  // Save current workspace under the new name
  const prevActive = project.activeWorkspace
  useProjectStore.getState().setActiveWorkspace(workspaceName)
  await saveProject(project.filePath)

  // The workspace names are updated by saveProject
  return true
}

/** Delete a workspace from the current project */
export async function deleteWorkspace(workspaceName: string): Promise<boolean> {
  const project = useProjectStore.getState()
  if (!project.filePath) return false
  if (project.activeWorkspace === workspaceName) return false // can't delete active

  const result = await window.electronAPI.readFile(project.filePath)
  if (!result.success || !result.content) return false

  try {
    const data: ConductorProject = JSON.parse(result.content)
    delete data.workspaces[workspaceName]
    await window.electronAPI.writeFile(project.filePath, JSON.stringify(data, null, 2))
    useProjectStore.getState().setWorkspaceNames(Object.keys(data.workspaces))
    return true
  } catch {
    return false
  }
}

/** Create a brand new project file and open it */
export async function createNewProject(projectName: string, directory: string): Promise<boolean> {
  const filePath = `${directory}/${projectName}.conductor`

  const data: ConductorProject = {
    version: 2,
    name: projectName,
    activeWorkspace: 'default',
    workspaces: {
      default: serializeWorkspace()
    },
    sidebar: {
      rootPath: directory,
      expandedPaths: []
    },
    activeExtensionId: null
  }

  const result = await window.electronAPI.writeFile(filePath, JSON.stringify(data, null, 2))
  if (!result.success) return false

  useSidebarStore.getState().setRootPath(directory)
  useProjectStore.getState().setProject(filePath, projectName)
  useProjectStore.getState().setActiveWorkspace('default')
  useProjectStore.getState().setWorkspaceNames(['default'])
  return true
}
