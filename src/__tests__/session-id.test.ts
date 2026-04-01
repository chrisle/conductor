import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTabsStore } from '../store/tabs'
import { nextSessionId } from '../lib/session-id'

function resetTabsStore() {
  useTabsStore.setState({ groups: {} })
}

describe('nextSessionId', () => {
  beforeEach(() => {
    resetTabsStore()
    localStorage.clear()
  })

  it('generates id with prefix and incrementing number', () => {
    const id = nextSessionId('claude-code')
    expect(id).toMatch(/^claude-code-\d+$/)
  })

  it('increments counter across calls', () => {
    const id1 = nextSessionId('terminal')
    const id2 = nextSessionId('terminal')
    const n1 = parseInt(id1.split('-').pop()!)
    const n2 = parseInt(id2.split('-').pop()!)
    expect(n2).toBeGreaterThan(n1)
  })

  it('persists counter in localStorage', () => {
    nextSessionId('claude-code')
    const stored = localStorage.getItem('conductor:sessionSeq:claude-code')
    expect(stored).toBeTruthy()
    expect(parseInt(stored!)).toBeGreaterThan(0)
  })

  it('continues from localStorage counter on next call', () => {
    localStorage.setItem('conductor:sessionSeq:test', '5')
    const id = nextSessionId('test')
    expect(id).toBe('test-6')
  })

  it('skips ids that collide with existing tabs', () => {
    // Set counter to 1
    localStorage.setItem('conductor:sessionSeq:term', '0')

    // Create a tab with id term-1 in a group
    const groupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(groupId, { id: 'term-1', type: 'terminal', title: 'T1' })

    const id = nextSessionId('term')
    // Should skip term-1 and go to term-2
    expect(id).toBe('term-2')
  })

  it('skips multiple colliding ids', () => {
    localStorage.setItem('conductor:sessionSeq:t', '0')

    const groupId = useTabsStore.getState().createGroup()
    useTabsStore.getState().addTab(groupId, { id: 't-1', type: 'terminal', title: 'T1' })
    useTabsStore.getState().addTab(groupId, { id: 't-2', type: 'terminal', title: 'T2' })
    useTabsStore.getState().addTab(groupId, { id: 't-3', type: 'terminal', title: 'T3' })

    const id = nextSessionId('t')
    expect(id).toBe('t-4')
  })

  it('uses separate counters for different prefixes', () => {
    const id1 = nextSessionId('claude-code')
    const id2 = nextSessionId('terminal')
    // Both should be -1 since different prefixes
    expect(id1).toBe('claude-code-1')
    expect(id2).toBe('terminal-1')
  })
})
