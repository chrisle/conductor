import { describe, it, expect } from 'vitest'
import { matchPrompt } from '../extensions/ai-cli/pty-handlers/useAnswerYes'

describe('matchPrompt', () => {
  it('matches numbered Yes/No menu with secondary context', () => {
    const prompt = 'Do you want to proceed?\n 1. Yes\n 2. No'
    expect(matchPrompt(prompt)).toBe('\r')
  })

  it('matches cursor menu "❯ Yes" with No option and secondary context', () => {
    expect(matchPrompt('Do you want to execute Bash?\n❯ Yes  Allow once\n  No, exit')).toBe('\r')
    expect(matchPrompt('Do you want to execute Bash?\n> Yes  Allow once\n  No, exit')).toBe('\r')
  })

  it('matches when No is option 3 (not option 2)', () => {
    const prompt = [
      'Do you want to make this edit to SKILL.md?',
      ' ❯ 1. Yes',
      '   2. Yes, and allow Claude to edit its own settings for this session',
      '   3. No',
    ].join('\n')
    expect(matchPrompt(prompt)).toBe('\r')
  })

  it('matches "Yes  Allow once" style with secondary context', () => {
    expect(matchPrompt('Do you want to proceed?\n  Yes  Allow once\n  No, exit')).toBe('\r')
    expect(matchPrompt("Do you want to proceed?\n  Yes and don't ask\n  No, exit")).toBe('\r')
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

  it('returns null when missing secondary context', () => {
    expect(matchPrompt('1. Yes\n2. No')).toBeNull()
  })

  it('returns null for slash-command picker', () => {
    const picker = '/edit    Edit a file\n/read    Read a file\n/bash    Run bash\nDo you want?\n1. Yes\n2. No'
    expect(matchPrompt(picker)).toBeNull()
  })
})
