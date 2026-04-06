import { describe, it, expect, beforeEach } from 'vitest'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore } from '../store/layout'
import { nextSessionId } from '../lib/session-id'

function resetStores() {
  useTabsStore.setState({ groups: {} })
  localStorage.clear()
}

/**
 * Simulates the openClaudeHere logic from FileTreeNode:
 * - For directories, opens Claude in that directory
 * - For files, opens Claude in the parent directory
 */
function openClaudeHere(
  entry: { path: string; isDirectory: boolean },
  groupId: string,
  focusedGroupId: string | null,
) {
  const cwd = entry.isDirectory
    ? entry.path
    : entry.path.substring(0, entry.path.lastIndexOf('/'))
  const layoutGroupIds = useLayoutStore.getState().getAllGroupIds()
  const targetGroupId =
    focusedGroupId && layoutGroupIds.includes(focusedGroupId)
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

describe('Open Claude here (file tree context menu)', () => {
  let groupId: string

  beforeEach(() => {
    resetStores()
    groupId = useTabsStore.getState().createGroup()
    // Register the group in layout so it's recognized
    useLayoutStore.getState().setRoot({ type: 'leaf', groupId })
  })

  it('opens claude-code tab in the directory when right-clicking a folder', () => {
    const result = openClaudeHere(
      { path: '/home/user/project/src', isDirectory: true },
      groupId,
      null,
    )

    const group = useTabsStore.getState().groups[groupId]
    const tab = group.tabs.find(t => t.id === result.id)

    expect(tab).toBeDefined()
    expect(tab!.type).toBe('claude-code')
    expect(tab!.filePath).toBe('/home/user/project/src')
    expect(tab!.initialCommand).toBe('claude\n')
  })

  it('opens claude-code tab in the parent directory when right-clicking a file', () => {
    const result = openClaudeHere(
      { path: '/home/user/project/src/main.ts', isDirectory: false },
      groupId,
      null,
    )

    const group = useTabsStore.getState().groups[groupId]
    const tab = group.tabs.find(t => t.id === result.id)

    expect(tab).toBeDefined()
    expect(tab!.type).toBe('claude-code')
    expect(tab!.filePath).toBe('/home/user/project/src')
  })

  it('falls back to node groupId when focusedGroupId is null', () => {
    const result = openClaudeHere(
      { path: '/home/user/project', isDirectory: true },
      groupId,
      null,
    )

    expect(result.targetGroupId).toBe(groupId)
  })

  it('generates unique session IDs for multiple Claude tabs', () => {
    const r1 = openClaudeHere(
      { path: '/home/user/project', isDirectory: true },
      groupId,
      null,
    )
    const r2 = openClaudeHere(
      { path: '/home/user/other', isDirectory: true },
      groupId,
      null,
    )

    expect(r1.id).not.toBe(r2.id)
    const group = useTabsStore.getState().groups[groupId]
    expect(group.tabs).toHaveLength(2)
  })

  it('sets the new tab as active', () => {
    const result = openClaudeHere(
      { path: '/home/user/project', isDirectory: true },
      groupId,
      null,
    )

    const group = useTabsStore.getState().groups[groupId]
    expect(group.activeTabId).toBe(result.id)
  })
})
