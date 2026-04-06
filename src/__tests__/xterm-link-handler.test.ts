import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the Terminal constructor options so we can inspect the linkHandler
let capturedOptions: any = null

vi.mock('@xterm/xterm', () => ({
  Terminal: class MockTerminal {
    options: any
    constructor(opts: any) {
      capturedOptions = opts
      this.options = opts
    }
    loadAddon() {}
    open() {}
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class { activate() {} dispose() {} },
}))

vi.mock('@xterm/addon-serialize', () => ({
  SerializeAddon: class { activate() {} dispose() {} },
}))

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    onContextLoss() { return { dispose: () => {} } }
    activate() {}
    dispose() {}
  },
}))

describe('xterm link handler', () => {
  beforeEach(() => {
    capturedOptions = null
    vi.mocked(window.electronAPI.openExternal).mockClear()
  })

  it('sets a custom linkHandler that opens URLs via Electron IPC', async () => {
    const { createXtermTerminal } = await import('../extensions/terminal/xterm-init')
    const container = document.createElement('div')
    await createXtermTerminal(container)

    expect(capturedOptions).toBeTruthy()
    expect(capturedOptions.linkHandler).toBeTruthy()
    expect(typeof capturedOptions.linkHandler.activate).toBe('function')
  })

  it('linkHandler.activate calls electronAPI.openExternal with the URL', async () => {
    const { createXtermTerminal } = await import('../extensions/terminal/xterm-init')
    const container = document.createElement('div')
    await createXtermTerminal(container)

    const mockEvent = new MouseEvent('click')
    capturedOptions.linkHandler.activate(mockEvent, 'https://example.com', {})

    expect(window.electronAPI.openExternal).toHaveBeenCalledWith('https://example.com')
  })

  it('linkHandler.activate passes the exact URL text from xterm', async () => {
    const { createXtermTerminal } = await import('../extensions/terminal/xterm-init')
    const container = document.createElement('div')
    await createXtermTerminal(container)

    const mockEvent = new MouseEvent('click')
    capturedOptions.linkHandler.activate(mockEvent, 'http://localhost:3000/api/test?q=1', {})

    expect(window.electronAPI.openExternal).toHaveBeenCalledWith('http://localhost:3000/api/test?q=1')
  })
})
