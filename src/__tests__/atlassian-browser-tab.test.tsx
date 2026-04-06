import React from 'react'
import { cleanup, render, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrowserTab from '../extensions/browser/BrowserTab'
import { useTabsStore } from '../store/tabs'
import { CONDUCTOR_MSG_PREFIX } from '../extensions/browser/atlassian-inject'

// Mock stores that the Conductor action handler depends on
vi.mock('../store/config', () => ({
  useConfigStore: Object.assign(
    vi.fn((sel: any) => sel({
      config: {
        aiCli: {
          claudeCode: {
            skipDangerousPermissions: true,
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
              skipDangerousPermissions: true,
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

vi.mock('../store/layout', () => ({
  useLayoutStore: Object.assign(vi.fn(), {
    getState: () => ({ focusedGroupId: null }),
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
