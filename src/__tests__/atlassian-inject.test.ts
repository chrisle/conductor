import { describe, it, expect } from 'vitest'
import {
  isAtlassianUrl,
  extractTicketKeyFromUrl,
  buildAtlassianInjectScript,
  CONDUCTOR_MSG_PREFIX,
} from '../extensions/browser/atlassian-inject'

describe('isAtlassianUrl', () => {
  it('returns true for standard atlassian.net domains', () => {
    expect(isAtlassianUrl('https://mysite.atlassian.net/browse/CON-41')).toBe(true)
    expect(isAtlassianUrl('https://triodeofficial.atlassian.net/jira/software/projects/CON/boards/1')).toBe(true)
  })

  it('returns true for subdomains of atlassian.net', () => {
    expect(isAtlassianUrl('https://id.atlassian.net/login')).toBe(true)
  })

  it('returns false for non-Atlassian URLs', () => {
    expect(isAtlassianUrl('https://google.com')).toBe(false)
    expect(isAtlassianUrl('https://github.com/browse/CON-41')).toBe(false)
    expect(isAtlassianUrl('https://notatlassian.net/browse/CON-41')).toBe(false)
  })

  it('returns false for invalid URLs', () => {
    expect(isAtlassianUrl('')).toBe(false)
    expect(isAtlassianUrl('not-a-url')).toBe(false)
  })

  it('returns false for about:blank', () => {
    expect(isAtlassianUrl('about:blank')).toBe(false)
  })
})

describe('extractTicketKeyFromUrl', () => {
  it('extracts ticket key from /browse/ URLs', () => {
    expect(extractTicketKeyFromUrl('https://site.atlassian.net/browse/CON-41')).toBe('CON-41')
    expect(extractTicketKeyFromUrl('https://site.atlassian.net/browse/PROJ-123')).toBe('PROJ-123')
    expect(extractTicketKeyFromUrl('https://site.atlassian.net/browse/AB-1')).toBe('AB-1')
  })

  it('extracts ticket key from selectedIssue query param', () => {
    expect(extractTicketKeyFromUrl(
      'https://site.atlassian.net/jira/software/projects/CON/boards/1?selectedIssue=CON-41'
    )).toBe('CON-41')
  })

  it('prefers /browse/ path over query param', () => {
    expect(extractTicketKeyFromUrl(
      'https://site.atlassian.net/browse/CON-99?selectedIssue=CON-41'
    )).toBe('CON-99')
  })

  it('returns null when no ticket key is found', () => {
    expect(extractTicketKeyFromUrl('https://site.atlassian.net/jira/projects')).toBeNull()
    expect(extractTicketKeyFromUrl('https://google.com')).toBeNull()
  })

  it('returns null for invalid URLs', () => {
    expect(extractTicketKeyFromUrl('')).toBeNull()
    expect(extractTicketKeyFromUrl('not-a-url')).toBeNull()
  })

  it('rejects malformed ticket keys in selectedIssue', () => {
    expect(extractTicketKeyFromUrl(
      'https://site.atlassian.net/boards?selectedIssue=lowercase-123'
    )).toBeNull()
    expect(extractTicketKeyFromUrl(
      'https://site.atlassian.net/boards?selectedIssue=NOPE'
    )).toBeNull()
  })
})

describe('buildAtlassianInjectScript', () => {
  it('returns a non-empty string', () => {
    const script = buildAtlassianInjectScript()
    expect(script).toBeTruthy()
    expect(typeof script).toBe('string')
  })

  it('includes the conductor message prefix', () => {
    const script = buildAtlassianInjectScript()
    expect(script).toContain(CONDUCTOR_MSG_PREFIX)
  })

  it('includes all four action names', () => {
    const script = buildAtlassianInjectScript()
    expect(script).toContain('start-coding-in-tab')
    expect(script).toContain('start-coding-in-background')
    expect(script).toContain('open-in-claude')
    expect(script).toContain('open-in-vscode')
  })

  it('includes menu labels matching the ticket spec', () => {
    const script = buildAtlassianInjectScript()
    expect(script).toContain('Start coding in tab')
    expect(script).toContain('Start coding in background')
    expect(script).toContain('Open in Claude')
    expect(script).toContain('Open in VSCode')
  })

  it('guards against double injection', () => {
    const script = buildAtlassianInjectScript()
    expect(script).toContain('__conductorInjected')
  })

  it('sets up a MutationObserver', () => {
    const script = buildAtlassianInjectScript()
    expect(script).toContain('MutationObserver')
  })
})

describe('CONDUCTOR_MSG_PREFIX', () => {
  it('ends with a colon for easy parsing', () => {
    expect(CONDUCTOR_MSG_PREFIX.endsWith(':')).toBe(true)
  })
})
