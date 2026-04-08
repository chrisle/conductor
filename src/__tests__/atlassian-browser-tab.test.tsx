import React from 'react'
import { cleanup, render, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrowserTab from '../extensions/browser/BrowserTab'
import { useTabsStore } from '../store/tabs'
import type { TabGroup } from '../store/tabs'
import { CONDUCTOR_MSG_PREFIX } from '../extensions/browser/atlassian-inject'

// Mock stores that the Conductor action handler depends on
vi.mock('../store/config', () => ({
  useConfigStore: Object.assign(
    vi.fn((sel: any) => sel({
      config: {
        aiCli: {
          claudeCode: {
            allowYoloMode: true, yoloModeByDefault: true,
            startWorkPromptTemplate: 'Work on {{ticketKey}} in {{projectKey}} at {{domain}}',
          },
        },
      },
    })),
    {
      getState: () => ({
        config: {
          aiCli: {
            claudeCode: {
              allowYoloMode: true, yoloModeByDefault: true,
              startWorkPromptTemplate: 'Work on {{ticketKey}} in {{projectKey}} at {{domain}}',
            },
          },
        },
      }),
    },
  ),
}))

vi.mock('../store/sidebar', () => ({
  useSidebarStore: Object.assign(vi.fn(), {
    getState: () => ({ rootPath: '/test/repo' }),
  }),
}))

const mockInsertAtEdge = vi.fn()
const mockSetFocusedGroup = vi.fn()

vi.mock('../store/layout', () => ({
  useLayoutStore: Object.assign(vi.fn(), {
    getState: () => ({
      focusedGroupId: null,
      insertAtEdge: mockInsertAtEdge,
      setFocusedGroup: mockSetFocusedGroup,
    }),
  }),
}))

vi.mock('../store/work-sessions', () => ({
  useWorkSessionsStore: Object.assign(vi.fn(), {
    getState: () => ({
      sessions: [],
      getActiveSessionForTicket: vi.fn().mockReturnValue(null),
      createSession: vi.fn().mockResolvedValue({ id: 'ws-1' }),
      updateSession: vi.fn(),
    }),
  }),
}))

vi.mock('../store/project', () => ({
  useProjectStore: Object.assign(vi.fn(), {
    getState: () => ({ filePath: '/test/repo/project.json' }),
  }),
}))

// Replace 'webview' with 'div' so JSDOM can render it
const originalCreateElement = React.createElement
vi.spyOn(React, 'createElement').mockImplementation((type: any, props: any, ...children: any[]) => {
  if (type === 'webview') {
    return originalCreateElement('div', { ...props, 'data-testid': 'mock-webview' }, ...children)
  }
  return originalCreateElement(type, props, ...children)
})

function patchWebview(container: HTMLElement, url = 'https://triodeofficial.atlassian.net/browse/CON-41') {
  const el = container.querySelector('[data-testid="mock-webview"]') as any
  if (!el) throw new Error('mock-webview not found')
  el.canGoBack = vi.fn(() => false)
  el.canGoForward = vi.fn(() => false)
  el.goBack = vi.fn()
  el.goForward = vi.fn()
  el.reload = vi.fn()
  el.stop = vi.fn()
  el.getURL = vi.fn(() => url)
  el.getTitle = vi.fn(() => 'CON-41 - Jira')
  el.loadURL = vi.fn(() => Promise.resolve())
  el.insertCSS = vi.fn(() => Promise.resolve())
  el.executeJavaScript = vi.fn(() => Promise.resolve())
  return el
}

function emitWebviewEvent(el: HTMLElement, name: string, props: Record<string, any> = {}) {
  const event = new Event(name, { bubbles: false })
  Object.assign(event, props)
  act(() => { el.dispatchEvent(event) })
}

describe('BrowserTab Atlassian integration', () => {
  const atlassianProps = {
    tabId: 'tab-1',
    groupId: 'group-1',
    isActive: true,
    tab: {
      id: 'tab-1',
      type: 'browser' as const,
      title: 'Jira',
      url: 'https://triodeofficial.atlassian.net/browse/CON-41',
    },
  }

  const nonAtlassianProps = {
    ...atlassianProps,
    tab: { ...atlassianProps.tab, url: 'https://google.com' },
  }

  beforeEach(() => {
    mockInsertAtEdge.mockClear()
    mockSetFocusedGroup.mockClear()

    // Mock electronAPI
    window.electronAPI = {
      worktreeList: vi.fn().mockResolvedValue([]),
      worktreeAdd: vi.fn().mockResolvedValue({ success: true, path: '/test/repo/worktrees/con-41' }),
      conductordKillTmuxSession: vi.fn().mockResolvedValue(undefined),
      killTerminal: vi.fn().mockResolvedValue(undefined),
      createTerminal: vi.fn().mockResolvedValue({ isNew: true }),
      setAutoPilot: vi.fn().mockResolvedValue(undefined),
      openExternal: vi.fn().mockResolvedValue(undefined),
    } as any

    useTabsStore.setState({
      groups: {
        'group-1': { id: 'group-1', tabs: [{ id: 'tab-1', type: 'browser', title: 'Jira' }], activeTabId: 'tab-1', tabHistory: ['tab-1'] },
      },
    })
  })

  afterEach(cleanup)

  it('injects Atlassian script on dom-ready for atlassian.net URLs', () => {
    const { container } = render(<BrowserTab {...atlassianProps} />)
    const wv = patchWebview(container)

    emitWebviewEvent(wv, 'dom-ready')

    // Should have called executeJavaScript twice: once for the bridge, once for Atlassian
    expect(wv.executeJavaScript).toHaveBeenCalledTimes(2)
    const calls = wv.executeJavaScript.mock.calls.map((c: any[]) => c[0] as string)
    // Second call should contain the Conductor injection marker
    expect(calls[1]).toContain('__conductorInjected')
  })

  it('does NOT inject Atlassian script for non-atlassian.net URLs', () => {
    const { container } = render(<BrowserTab {...nonAtlassianProps} />)
    const wv = patchWebview(container, 'https://google.com')

    emitWebviewEvent(wv, 'dom-ready')

    // Only the bridge JS should be injected, not the Atlassian script
    expect(wv.executeJavaScript).toHaveBeenCalledTimes(1)
  })

  it('handles open-in-vscode action from console-message', async () => {
    const { container } = render(<BrowserTab {...atlassianProps} />)
    const wv = patchWebview(container)

    emitWebviewEvent(wv, 'dom-ready')

    // Simulate the injected script sending a message via console.log
    const message = CONDUCTOR_MSG_PREFIX + JSON.stringify({
      action: 'open-in-vscode',
      ticketKey: 'CON-41',
    })

    await act(async () => {
      emitWebviewEvent(wv, 'console-message', { message })
      // Allow async action handler to complete
      await new Promise(r => setTimeout(r, 50))
    })

    expect(window.electronAPI.worktreeAdd).toHaveBeenCalledWith('/test/repo', 'con-41')
    expect(window.electronAPI.openExternal).toHaveBeenCalledWith('vscode://file//test/repo/worktrees/con-41')
  })

  it('handles open-in-claude action from console-message', async () => {
    const { container } = render(<BrowserTab {...atlassianProps} />)
    const wv = patchWebview(container)

    emitWebviewEvent(wv, 'dom-ready')

    const message = CONDUCTOR_MSG_PREFIX + JSON.stringify({
      action: 'open-in-claude',
      ticketKey: 'CON-41',
    })

    await act(async () => {
      emitWebviewEvent(wv, 'console-message', { message })
      await new Promise(r => setTimeout(r, 50))
    })

    // Should have added a claude-code tab
    const tabs = useTabsStore.getState().groups['group-1'].tabs
    const claudeTab = tabs.find((t: any) => t.type === 'claude-code')
    expect(claudeTab).toBeDefined()
    expect(claudeTab!.title).toContain('CON-41')
  })

  it('handles start-coding-in-background action', async () => {
    const { container } = render(<BrowserTab {...atlassianProps} />)
    const wv = patchWebview(container)

    emitWebviewEvent(wv, 'dom-ready')

    const message = CONDUCTOR_MSG_PREFIX + JSON.stringify({
      action: 'start-coding-in-background',
      ticketKey: 'CON-41',
    })

    await act(async () => {
      emitWebviewEvent(wv, 'console-message', { message })
      await new Promise(r => setTimeout(r, 50))
    })

    // Background: should call createTerminal + setAutoPilot, not addTab
    expect(window.electronAPI.createTerminal).toHaveBeenCalledWith(
      't-CON-41',
      '/test/repo/worktrees/con-41',
      expect.stringContaining('claude'),
    )
    expect(window.electronAPI.setAutoPilot).toHaveBeenCalledWith('t-CON-41', true)
  })

  it('start-coding-in-tab creates a new column on the far right (CON-82)', async () => {
    const { container } = render(<BrowserTab {...atlassianProps} />)
    const wv = patchWebview(container)

    emitWebviewEvent(wv, 'dom-ready')

    const message = CONDUCTOR_MSG_PREFIX + JSON.stringify({
      action: 'start-coding-in-tab',
      ticketKey: 'CON-41',
    })

    await act(async () => {
      emitWebviewEvent(wv, 'console-message', { message })
      await new Promise(r => setTimeout(r, 50))
    })

    // A new group should have been created and inserted at the east edge
    const allGroups = useTabsStore.getState().groups
    const newGroupEntry = (Object.entries(allGroups) as [string, TabGroup][]).find(
      ([id, g]) => id !== 'group-1' && g.tabs.some(t => t.id === 't-CON-41')
    )
    expect(newGroupEntry).toBeDefined()
    const [newGroupId, newGroup] = newGroupEntry!
    const claudeTab = newGroup.tabs.find(t => t.id === 't-CON-41')
    expect(claudeTab).toBeDefined()
    expect(claudeTab!.type).toBe('claude-code')
    expect(claudeTab!.autoPilot).toBe(true)
    expect(mockInsertAtEdge).toHaveBeenCalledWith('east', newGroupId)
  })

  it('start-coding-in-tab focuses existing tab instead of duplicating (CON-82)', async () => {
    // Pre-populate an existing claude-code tab for this ticket in a second group
    useTabsStore.setState({
      groups: {
        'group-1': { id: 'group-1', tabs: [{ id: 'tab-1', type: 'browser', title: 'Jira' }], activeTabId: 'tab-1', tabHistory: ['tab-1'] },
        'group-2': { id: 'group-2', tabs: [{ id: 't-CON-41', type: 'claude-code', title: 'Claude · CON-41' }], activeTabId: 't-CON-41', tabHistory: ['t-CON-41'] },
      },
    })

    const { container } = render(<BrowserTab {...atlassianProps} />)
    const wv = patchWebview(container)
    emitWebviewEvent(wv, 'dom-ready')

    const message = CONDUCTOR_MSG_PREFIX + JSON.stringify({
      action: 'start-coding-in-tab',
      ticketKey: 'CON-41',
    })

    await act(async () => {
      emitWebviewEvent(wv, 'console-message', { message })
      await new Promise(r => setTimeout(r, 50))
    })

    // No new group should be created — still only 2 groups
    const groupCount = Object.keys(useTabsStore.getState().groups).length
    expect(groupCount).toBe(2)
    // insertAtEdge should NOT have been called
    expect(mockInsertAtEdge).not.toHaveBeenCalled()
    // setFocusedGroup should have been called with the existing group
    expect(mockSetFocusedGroup).toHaveBeenCalledWith('group-2')
  })

  it('uses custom prompt template from config store (CON-55)', async () => {
    const { container } = render(<BrowserTab {...atlassianProps} />)
    const wv = patchWebview(container)

    emitWebviewEvent(wv, 'dom-ready')

    const message = CONDUCTOR_MSG_PREFIX + JSON.stringify({
      action: 'start-coding-in-background',
      ticketKey: 'CON-41',
    })

    await act(async () => {
      emitWebviewEvent(wv, 'console-message', { message })
      await new Promise(r => setTimeout(r, 50))
    })

    // The mock config has template: 'Work on {{ticketKey}} in {{projectKey}} at {{domain}}'
    // Verify the command contains the interpolated custom template, not the default
    const cmd = (window.electronAPI.createTerminal as any).mock.calls[0][2] as string
    expect(cmd).toContain('Work on CON-41 in CON at')
    expect(cmd).not.toContain('Work autonomously on this ticket end to end')
  })

  it('ignores non-Conductor console messages', () => {
    const { container } = render(<BrowserTab {...atlassianProps} />)
    const wv = patchWebview(container)

    emitWebviewEvent(wv, 'dom-ready')

    // A normal console.log should not trigger any action
    emitWebviewEvent(wv, 'console-message', { message: 'Hello world' })
    emitWebviewEvent(wv, 'console-message', { message: '{"not":"conductor"}' })

    // No worktree calls should have been made
    expect(window.electronAPI.worktreeList).not.toHaveBeenCalled()
    expect(window.electronAPI.worktreeAdd).not.toHaveBeenCalled()
  })
})
