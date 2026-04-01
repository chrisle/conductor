import { describe, it, expect } from 'vitest'
import { matchPrompt } from '../extensions/ai-cli/pty-handlers/useAnswerYes'

describe('matchPrompt', () => {
  it('matches legacy "1. Yes"', () => {
    expect(matchPrompt('1. Yes')).toBe('\r')
    expect(matchPrompt('1 Yes')).toBe('\r')
  })

  it('matches cursor menu "❯ Yes"', () => {
    expect(matchPrompt('❯ Yes  Allow once')).toBe('\r')
    expect(matchPrompt('> Yes  Allow once')).toBe('\r')
  })

  it('matches "Yes  Allow once"', () => {
    expect(matchPrompt('  Yes  Allow once')).toBe('\r')
    expect(matchPrompt("Yes and don't ask again")).toBe('\r')
  })

  it('matches (Y/n)', () => {
    expect(matchPrompt('Continue? (Y/n)')).toBe('y\r')
  })

  it('matches Allow (y/n)', () => {
    expect(matchPrompt('Allow access to foo (y/n)')).toBe('y\r')
  })

  it('matches proceed? (y/n)', () => {
    expect(matchPrompt('proceed? (y/n)')).toBe('y\r')
  })

  it('returns null for no match', () => {
    expect(matchPrompt('Hello world')).toBeNull()
    expect(matchPrompt('Yesterday was nice')).toBeNull()
  })
})
