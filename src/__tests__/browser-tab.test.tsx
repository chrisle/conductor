import React from 'react'
import { cleanup, render, fireEvent, screen, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrowserTab from '../extensions/browser/BrowserTab'
import { useTabsStore } from '../store/tabs'

// Replace 'webview' with 'div' so JSDOM can render it, preserving all props
const originalCreateElement = React.createElement
vi.spyOn(React, 'createElement').mockImplementation((type: any, props: any, ...children: any[]) => {
  if (type === 'webview') {
    return originalCreateElement('div', { ...props, 'data-testid': 'mock-webview' }, ...children)
  }
  return originalCreateElement(type, props, ...children)
})

// Attach Electron webview methods to the rendered div so the component's
// ref-based calls (canGoBack, loadURL, etc.) work in JSDOM.
function patchWebview(container: HTMLElement) {
  const el = container.querySelector('[data-testid="mock-webview"]') as any
  if (!el) throw new Error('mock-webview not found')
  el.canGoBack = vi.fn(() => false)
  el.canGoForward = vi.fn(() => false)
  el.goBack = vi.fn()
  el.goForward = vi.fn()
  el.reload = vi.fn()
  el.stop = vi.fn()
  el.getURL = vi.fn(() => 'https://jira.example.com')
  el.getTitle = vi.fn(() => 'Jira')
  el.loadURL = vi.fn(() => Promise.resolve())
  el.insertCSS = vi.fn(() => Promise.resolve())
  el.executeJavaScript = vi.fn(() => Promise.resolve())
  return el
}

// Dispatch a synthetic Electron-style webview event (properties live on the event object)
function emitWebviewEvent(el: HTMLElement, name: string, props: Record<string, any> = {}) {
  const event = new Event(name, { bubbles: false })
  Object.assign(event, props)
  act(() => { el.dispatchEvent(event) })
}

// JSDOM doesn't provide DataTransfer — create a minimal mock for drag tests
class MockDataTransfer {
  private data: Record<string, string> = {}
  get types() { return Object.keys(this.data) }
  setData(type: string, value: string) { this.data[type] = value }
  getData(type: string) { return this.data[type] ?? '' }
  clearData() { this.data = {} }
  dropEffect = 'none' as DataTransfer['dropEffect']
  effectAllowed = 'all' as DataTransfer['effectAllowed']
  files = [] as unknown as FileList
  items = [] as unknown as DataTransferItemList
}

describe('BrowserTab', () => {
  const defaultProps = {
    tabId: 'tab-1',
    groupId: 'group-1',
    isActive: true,
    tab: { id: 'tab-1', type: 'browser' as const, title: 'Browser', url: 'https://jira.example.com' },
  }

  beforeEach(() => {
    useTabsStore.setState({
      groups: {
        'group-1': { id: 'group-1', tabs: [{ id: 'tab-1', type: 'browser', title: 'Browser' }], activeTabId: 'tab-1', tabHistory: ['tab-1'] },
      },
    })
  })

  afterEach(cleanup)

  it('sets the initial URL as src and never changes it on re-render', () => {
    const { container } = render(<BrowserTab {...defaultProps} />)
    const wv = container.querySelector('[data-testid="mock-webview"]')!
    expect(wv.getAttribute('src')).toBe('https://jira.example.com')
  })

  it('navigate() calls loadURL without mutating the src attribute', () => {
    const { container } = render(<BrowserTab {...defaultProps} />)
    const wv = patchWebview(container)

    const input = screen.getByPlaceholderText('Enter URL or search...')
    fireEvent.change(input, { target: { value: 'https://new-page.com' } })
    fireEvent.submit(input.closest('form')!)

    expect(wv.loadURL).toHaveBeenCalledWith('https://new-page.com')
    // src must remain the initial value — changing it would cause a double navigation
    expect(wv.getAttribute('src')).toBe('https://jira.example.com')
  })

  it('updates the URL bar on did-navigate-in-page (SPA navigation)', () => {
    const { container } = render(<BrowserTab {...defaultProps} />)
    patchWebview(container)
    const wv = container.querySelector('[data-testid="mock-webview"]') as HTMLElement

    emitWebviewEvent(wv, 'did-navigate-in-page', { url: 'https://jira.example.com/browse/CON-21' })

    const input = screen.getByPlaceholderText('Enter URL or search...')
    expect(input).toHaveValue('https://jira.example.com/browse/CON-21')
  })

  it('opens a new browser tab on new-window event', () => {
    const { container } = render(<BrowserTab {...defaultProps} />)
    patchWebview(container)
    const wv = container.querySelector('[data-testid="mock-webview"]') as HTMLElement

    const tabsBefore = useTabsStore.getState().groups['group-1'].tabs.length

    emitWebviewEvent(wv, 'new-window', { url: 'https://external.example.com/page' })

    const tabsAfter = useTabsStore.getState().groups['group-1'].tabs
    expect(tabsAfter.length).toBe(tabsBefore + 1)
    const newTab = tabsAfter[tabsAfter.length - 1]
    expect(newTab.type).toBe('browser')
    expect(newTab.url).toBe('https://external.example.com/page')
  })

  it('ignores about:blank new-window events', () => {
    const { container } = render(<BrowserTab {...defaultProps} />)
    patchWebview(container)
    const wv = container.querySelector('[data-testid="mock-webview"]') as HTMLElement

    const tabsBefore = useTabsStore.getState().groups['group-1'].tabs.length
    emitWebviewEvent(wv, 'new-window', { url: 'about:blank' })

    expect(useTabsStore.getState().groups['group-1'].tabs.length).toBe(tabsBefore)
  })

  it('normalizes bare domains to https', () => {
    const { container } = render(<BrowserTab {...defaultProps} />)
    const wv = patchWebview(container)

    const input = screen.getByPlaceholderText('Enter URL or search...')
    fireEvent.change(input, { target: { value: 'example.com' } })
    fireEvent.submit(input.closest('form')!)

    expect(wv.loadURL).toHaveBeenCalledWith('https://example.com')
  })

  it('turns non-URL input into a Google search', () => {
    const { container } = render(<BrowserTab {...defaultProps} />)
    const wv = patchWebview(container)

    const input = screen.getByPlaceholderText('Enter URL or search...')
    fireEvent.change(input, { target: { value: 'what is jira' } })
    fireEvent.submit(input.closest('form')!)

    expect(wv.loadURL).toHaveBeenCalledWith('https://www.google.com/search?q=what%20is%20jira')
  })

  it('updates URL bar after full page load without changing src', () => {
    const { container } = render(<BrowserTab {...defaultProps} />)
    const wv = patchWebview(container)
    wv.getURL.mockReturnValue('https://jira.example.com/board')
    wv.getTitle.mockReturnValue('Board - Jira')

    emitWebviewEvent(wv, 'did-stop-loading')

    const input = screen.getByPlaceholderText('Enter URL or search...')
    expect(input).toHaveValue('https://jira.example.com/board')
    // src must still be the original — the key fix for the double-navigation bug
    expect(wv.getAttribute('src')).toBe('https://jira.example.com')
  })

  describe('drag overlay for webview tabs', () => {
    // Helper: create a DragEvent with a mock dataTransfer (JSDOM lacks DataTransfer)
    function makeDragEvent(type: string, dt?: MockDataTransfer): DragEvent {
      const event = new Event(type, { bubbles: true }) as DragEvent
      if (dt) {
        Object.defineProperty(event, 'dataTransfer', { value: dt })
      }
      return event
    }

    function startTabDrag(): MockDataTransfer {
      const dt = new MockDataTransfer()
      dt.setData('__dragging_tab__', 'some-tab-id')
      act(() => { window.dispatchEvent(makeDragEvent('dragstart', dt)) })
      return dt
    }

    it('shows a drag overlay when a tab drag starts', () => {
      const { container } = render(<BrowserTab {...defaultProps} />)
      const webviewContainer = container.querySelector('.flex-1.overflow-hidden.relative')!

      // No overlay initially
      expect(webviewContainer.querySelector('.absolute.inset-0.z-10')).toBeNull()

      startTabDrag()

      // Overlay should now be visible on top of the webview
      expect(webviewContainer.querySelector('.absolute.inset-0.z-10')).not.toBeNull()
    })

    it('hides the drag overlay on dragend', () => {
      const { container } = render(<BrowserTab {...defaultProps} />)
      const webviewContainer = container.querySelector('.flex-1.overflow-hidden.relative')!

      startTabDrag()
      expect(webviewContainer.querySelector('.absolute.inset-0.z-10')).not.toBeNull()

      act(() => { window.dispatchEvent(makeDragEvent('dragend')) })
      expect(webviewContainer.querySelector('.absolute.inset-0.z-10')).toBeNull()
    })

    it('hides the drag overlay on drop', () => {
      const { container } = render(<BrowserTab {...defaultProps} />)
      const webviewContainer = container.querySelector('.flex-1.overflow-hidden.relative')!

      startTabDrag()
      expect(webviewContainer.querySelector('.absolute.inset-0.z-10')).not.toBeNull()

      act(() => { window.dispatchEvent(makeDragEvent('drop')) })
      expect(webviewContainer.querySelector('.absolute.inset-0.z-10')).toBeNull()
    })

    it('does not show overlay for non-tab drags', () => {
      const { container } = render(<BrowserTab {...defaultProps} />)
      const webviewContainer = container.querySelector('.flex-1.overflow-hidden.relative')!

      // Simulate a generic drag (e.g. file from OS) without the __dragging_tab__ type
      const dt = new MockDataTransfer()
      dt.setData('text/plain', 'hello')
      act(() => { window.dispatchEvent(makeDragEvent('dragstart', dt)) })

      // Overlay should NOT appear for non-tab drags
      expect(webviewContainer.querySelector('.absolute.inset-0.z-10')).toBeNull()
    })

    it('cleans up window event listeners on unmount', () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const removeSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = render(<BrowserTab {...defaultProps} />)

      const dragEvents = ['dragstart', 'dragend', 'drop']
      for (const event of dragEvents) {
        expect(addSpy).toHaveBeenCalledWith(event, expect.any(Function))
      }

      unmount()

      for (const event of dragEvents) {
        expect(removeSpy).toHaveBeenCalledWith(event, expect.any(Function))
      }

      addSpy.mockRestore()
      removeSpy.mockRestore()
    })
  })
})
