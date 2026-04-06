import { describe, it, expect, beforeEach } from 'vitest'
import { restoreProject } from '../lib/project-io'
import { useTabsStore } from '../store/tabs'
import { useLayoutStore, type LayoutNode } from '../store/layout'
import type { ConductorProject, Workspace, SerializedTabGroup } from '../store/project'

// Add conductordGetSessions mock (not in default setup.ts)
;(window.electronAPI as any).conductordGetSessions = vi.fn()

/** Build a minimal Workspace for testing */
function makeWorkspace(
  groups: Record<string, SerializedTabGroup>,
  layout: LayoutNode,
  focusedGroupId: string | null = null,
): Workspace {
  return { groups, layout, focusedGroupId }
}

/** Wrap a workspace in a minimal ConductorProject */
function wrapProject(workspace: Workspace): ConductorProject {
  return {
    version: 3,
    name: 'test',
    activeWorkspace: 'default',
    workspaces: { default: workspace },
    sidebar: { rootPath: null, expandedPaths: [] },
    activeExtensionId: null,
  }
}

describe('restoreProject – empty pane cleanup (CON-74)', () => {
  beforeEach(() => {
    // Reset stores to a clean state
    useTabsStore.setState({ groups: {} })
    useLayoutStore.setState({ root: null, focusedGroupId: null })

    // By default, conductord returns no live sessions (all session tabs are stale)
    vi.mocked((window.electronAPI as any).conductordGetSessions).mockResolvedValue([])
  })

  it('removes panes whose tabs were all filtered as stale sessions', async () => {
    const ws = makeWorkspace(
      {
        'g1': {
          id: 'g1',
          tabs: [{ id: 'term-1', type: 'terminal', title: 'Terminal 1' }],
          activeTabId: 'term-1',
          tabHistory: ['term-1'],
        },
        'g2': {
          id: 'g2',
          tabs: [{ id: 'file-1', type: 'file', title: 'index.ts' }],
          activeTabId: 'file-1',
          tabHistory: ['file-1'],
        },
      },
      {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      },
      'g1',
    )

    await restoreProject(wrapProject(ws))

    const groups = useTabsStore.getState().groups
    const layoutGroupIds = useLayoutStore.getState().getAllGroupIds()

    // g1 (terminal only) should be removed; g2 (file tab) should remain
    expect(groups['g1']).toBeUndefined()
    expect(groups['g2']).toBeDefined()
    expect(groups['g2'].tabs).toHaveLength(1)

    // Layout should only contain g2
    expect(layoutGroupIds).toContain('g2')
    expect(layoutGroupIds).not.toContain('g1')
  })

  it('creates a fresh default group when ALL groups end up empty', async () => {
    const ws = makeWorkspace(
      {
        'g1': {
          id: 'g1',
          tabs: [{ id: 'term-1', type: 'terminal', title: 'Terminal 1' }],
          activeTabId: 'term-1',
        },
        'g2': {
          id: 'g2',
          tabs: [{ id: 'claude-1', type: 'claude-code', title: 'Claude' }],
          activeTabId: 'claude-1',
        },
      },
      {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      },
    )

    await restoreProject(wrapProject(ws))

    const groups = useTabsStore.getState().groups
    const root = useLayoutStore.getState().root
    const groupIds = Object.keys(groups)

    // A fresh group should have been created
    expect(groupIds).toHaveLength(1)
    expect(groups[groupIds[0]].tabs).toHaveLength(0)

    // Layout should point to the fresh group
    expect(root).not.toBeNull()
    expect(root!.type).toBe('leaf')
    expect((root as any).groupId).toBe(groupIds[0])
  })

  it('keeps all groups when sessions are still alive', async () => {
    vi.mocked((window.electronAPI as any).conductordGetSessions).mockResolvedValue([
      { id: 'term-1', dead: false },
      { id: 'term-2', dead: false },
    ])

    const ws = makeWorkspace(
      {
        'g1': {
          id: 'g1',
          tabs: [{ id: 'term-1', type: 'terminal', title: 'Terminal 1' }],
          activeTabId: 'term-1',
        },
        'g2': {
          id: 'g2',
          tabs: [{ id: 'term-2', type: 'terminal', title: 'Terminal 2' }],
          activeTabId: 'term-2',
        },
      },
      {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      },
    )

    await restoreProject(wrapProject(ws))

    const groups = useTabsStore.getState().groups
    const layoutGroupIds = useLayoutStore.getState().getAllGroupIds()

    expect(Object.keys(groups)).toHaveLength(2)
    expect(layoutGroupIds).toContain('g1')
    expect(layoutGroupIds).toContain('g2')
  })

  it('preserves focusedGroupId when that group survives filtering', async () => {
    const ws = makeWorkspace(
      {
        'g1': {
          id: 'g1',
          tabs: [{ id: 'term-1', type: 'terminal', title: 'Terminal' }],
          activeTabId: 'term-1',
        },
        'g2': {
          id: 'g2',
          tabs: [{ id: 'file-1', type: 'file', title: 'main.ts' }],
          activeTabId: 'file-1',
        },
      },
      {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      },
      'g2', // focused group
    )

    await restoreProject(wrapProject(ws))

    expect(useLayoutStore.getState().focusedGroupId).toBe('g2')
  })

  it('does not set focusedGroupId when the focused group was removed', async () => {
    const ws = makeWorkspace(
      {
        'g1': {
          id: 'g1',
          tabs: [{ id: 'term-1', type: 'terminal', title: 'Terminal' }],
          activeTabId: 'term-1',
        },
        'g2': {
          id: 'g2',
          tabs: [{ id: 'file-1', type: 'file', title: 'main.ts' }],
          activeTabId: 'file-1',
        },
      },
      {
        type: 'row',
        children: [
          { node: { type: 'leaf', groupId: 'g1' }, size: 1 },
          { node: { type: 'leaf', groupId: 'g2' }, size: 1 },
        ],
      },
      'g1', // focused group — will be removed
    )

    await restoreProject(wrapProject(ws))

    // focusedGroupId should NOT be g1 (which was removed)
    expect(useLayoutStore.getState().focusedGroupId).not.toBe('g1')
  })
})
