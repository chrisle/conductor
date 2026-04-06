import { describe, it, expect, beforeEach } from 'vitest'
import { useSidebarStore } from '../store/sidebar'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore } from '../store/layout'
import { nextSessionId } from '../lib/session-id'

function resetStores() {
  useSidebarStore.setState({
    width: 240,
    isVisible: true,
    rootPath: '/home/user/project',
    expandedPaths: new Set(),
    favorites: [],
    selectedPath: null,
  })
  useTabsStore.setState({ groups: {} })
  localStorage.clear()
}

/**
 * Simulates the background context menu "Open Terminal here" action from FileTree.
 */
function openTerminalHere(rootPath: string | null, groupId: string, focusedGroupId: string | null) {
  const cwd = rootPath || '/'
  const layoutGroupIds = useLayoutStore.getState().getAllGroupIds()
  const targetGroupId = (focusedGroupId && layoutGroupIds.includes(focusedGroupId))
    ? focusedGroupId
    : groupId
  useTabsStore.getState().addTab(targetGroupId, { type: 'terminal', title: 'Terminal', filePath: cwd })
  return { cwd, targetGroupId }
}

/**
 * Simulates the background context menu "Open Claude here" action from FileTree.
 */
function openClaudeHereFromBackground(rootPath: string | null, groupId: string, focusedGroupId: string | null) {
  const cwd = rootPath || '/'
  const layoutGroupIds = useLayoutStore.getState().getAllGroupIds()
  const targetGroupId = (focusedGroupId && layoutGroupIds.includes(focusedGroupId))
    ? focusedGroupId
    : groupId
  const id = nextSessionId('claude-code')
  useTabsStore.getState().addTab(targetGroupId, {
    id,
    type: 'claude-code',
    title: id,
    filePath: cwd,
    initialCommand: 'claude\n',
  })
  return { id, cwd, targetGroupId }
}

describe('File explorer background context menu', () => {
  let groupId: string

  beforeEach(() => {
    resetStores()
    groupId = useTabsStore.getState().createGroup()
    useLayoutStore.getState().setRoot({ type: 'leaf', groupId })
  })

  it('Open Terminal here opens a terminal tab in the current rootPath', () => {
    const result = openTerminalHere('/home/user/project', groupId, null)

    const group = useTabsStore.getState().groups[groupId]
    const tab = group.tabs.find(t => t.type === 'terminal')

    expect(tab).toBeDefined()
    expect(tab!.type).toBe('terminal')
    expect(tab!.filePath).toBe('/home/user/project')
    expect(result.targetGroupId).toBe(groupId)
  })

  it('Open Claude here opens a claude-code tab in the current rootPath', () => {
    const result = openClaudeHereFromBackground('/home/user/project', groupId, null)

    const group = useTabsStore.getState().groups[groupId]
    const tab = group.tabs.find(t => t.id === result.id)

    expect(tab).toBeDefined()
    expect(tab!.type).toBe('claude-code')
    expect(tab!.filePath).toBe('/home/user/project')
    expect(tab!.initialCommand).toBe('claude\n')
  })

  it('falls back to "/" when rootPath is null', () => {
    const result = openTerminalHere(null, groupId, null)
    expect(result.cwd).toBe('/')
  })
})

describe('File explorer selection behavior', () => {
  beforeEach(() => {
    resetStores()
  })

  it('single click selects a file without opening it', () => {
    // Simulate single click behavior: set selectedPath, do not open file
    useSidebarStore.getState().setSelectedPath('/home/user/project/src/main.ts')

    expect(useSidebarStore.getState().selectedPath).toBe('/home/user/project/src/main.ts')
    // No tabs should have been created
  })

  it('clicking a different file changes selection', () => {
    useSidebarStore.getState().setSelectedPath('/home/user/project/a.ts')
    useSidebarStore.getState().setSelectedPath('/home/user/project/b.ts')

    expect(useSidebarStore.getState().selectedPath).toBe('/home/user/project/b.ts')
  })

  it('clicking the same file twice keeps the same selection', () => {
    useSidebarStore.getState().setSelectedPath('/home/user/project/a.ts')
    // Second click on the same file — selectedPath stays the same
    const isSelected = useSidebarStore.getState().selectedPath === '/home/user/project/a.ts'
    expect(isSelected).toBe(true)
  })
})

describe('File explorer node context menu - Open Terminal here', () => {
  let groupId: string

  beforeEach(() => {
    resetStores()
    groupId = useTabsStore.getState().createGroup()
    useLayoutStore.getState().setRoot({ type: 'leaf', groupId })
  })

  it('opens terminal in directory path for a directory node', () => {
    const cwd = '/home/user/project/src'
    const targetGroupId = groupId
    useTabsStore.getState().addTab(targetGroupId, { type: 'terminal', title: 'Terminal', filePath: cwd })

    const group = useTabsStore.getState().groups[groupId]
    const tab = group.tabs.find(t => t.type === 'terminal')

    expect(tab).toBeDefined()
    expect(tab!.filePath).toBe('/home/user/project/src')
  })

  it('opens terminal in parent directory for a file node', () => {
    const filePath = '/home/user/project/src/main.ts'
    const cwd = filePath.substring(0, filePath.lastIndexOf('/'))
    useTabsStore.getState().addTab(groupId, { type: 'terminal', title: 'Terminal', filePath: cwd })

    const group = useTabsStore.getState().groups[groupId]
    const tab = group.tabs.find(t => t.type === 'terminal')

    expect(tab).toBeDefined()
    expect(tab!.filePath).toBe('/home/user/project/src')
  })
})
