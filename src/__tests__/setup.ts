import '@testing-library/jest-dom/vitest'

// Mock window.electronAPI for store tests that reference it
Object.defineProperty(window, 'electronAPI', {
  value: {
    saveFavorites: vi.fn(),
    loadFavorites: vi.fn(),
    readDir: vi.fn(),
    readFile: vi.fn(),
    readFileBinary: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
    mkdir: vi.fn(),
    delete: vi.fn(),
    getHomeDir: vi.fn(),
    autocomplete: vi.fn(),
    gitBranch: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn(),
    createTerminal: vi.fn(),
    writeTerminal: vi.fn(),
    resizeTerminal: vi.fn(),
    killTerminal: vi.fn(),
    onTerminalData: vi.fn(),
    onTerminalExit: vi.fn()
  },
  writable: true
})
