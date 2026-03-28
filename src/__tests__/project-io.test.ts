import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateWorkspaceName,
  registerTerminalBuffer,
  unregisterTerminalBuffer,
} from '../lib/project-io'

describe('generateWorkspaceName', () => {
  it('returns "Untitled Workspace" when list is empty', () => {
    expect(generateWorkspaceName([])).toBe('Untitled Workspace')
  })

  it('returns "Untitled Workspace" when it is not in the list', () => {
    expect(generateWorkspaceName(['Other Workspace'])).toBe('Untitled Workspace')
  })

  it('returns "Untitled Workspace 2" when base name is taken', () => {
    expect(generateWorkspaceName(['Untitled Workspace'])).toBe('Untitled Workspace 2')
  })

  it('returns "Untitled Workspace 3" when 1 and 2 are taken', () => {
    expect(generateWorkspaceName(['Untitled Workspace', 'Untitled Workspace 2'])).toBe(
      'Untitled Workspace 3'
    )
  })

  it('skips gaps and finds the next available number', () => {
    // If 1 and 3 are taken but 2 is not, should return 2
    expect(
      generateWorkspaceName(['Untitled Workspace', 'Untitled Workspace 3'])
    ).toBe('Untitled Workspace 2')
  })

  it('handles a large sequence', () => {
    const names = ['Untitled Workspace', ...Array.from({ length: 9 }, (_, i) => `Untitled Workspace ${i + 2}`)]
    expect(generateWorkspaceName(names)).toBe('Untitled Workspace 11')
  })
})

describe('registerTerminalBuffer / unregisterTerminalBuffer', () => {
  it('registers and can be called', () => {
    const getBuffer = () => 'buffer content'
    registerTerminalBuffer('tab-1', getBuffer)
    // No error thrown — registration succeeded
  })

  it('unregisters without error for a known id', () => {
    registerTerminalBuffer('tab-2', () => 'data')
    expect(() => unregisterTerminalBuffer('tab-2')).not.toThrow()
  })

  it('unregisters without error for an unknown id', () => {
    expect(() => unregisterTerminalBuffer('nonexistent')).not.toThrow()
  })
})
