import { describe, it, expect } from 'vitest'
import {
  stripAnsi,
  isThinking,
  matchAutopilotRule,
  AUTOPILOT_RULES
} from '../lib/terminal-detection'

describe('stripAnsi', () => {
  it('removes basic color codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red')
  })

  it('removes cursor movement sequences', () => {
    expect(stripAnsi('\x1b[2Ahello\x1b[1B')).toBe('hello')
  })

  it('removes carriage returns', () => {
    expect(stripAnsi('line\r\n')).toBe('line\n')
  })

  it('passes through plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world')
  })

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('')
  })

  it('strips charset designation sequences', () => {
    expect(stripAnsi('\x1b(Btext')).toBe('text')
  })
})

describe('isThinking', () => {
  it('detects thinking status with ellipsis and parenthesized stats', () => {
    expect(isThinking('✳ Zigzagging… (4m 35s · ↓ 611 tokens)')).toBe(true)
  })

  it('detects thinking with ANSI codes around it', () => {
    expect(isThinking('\x1b[33m✳ Planning… (12s · ↓ 42 tokens)\x1b[0m')).toBe(true)
  })

  it('detects thinking with various status messages', () => {
    expect(isThinking('⠋ Reasoning… (1s)')).toBe(true)
    expect(isThinking('✳ Processing… (0s · ↓ 10 tokens)')).toBe(true)
  })

  it('returns false for normal terminal output', () => {
    expect(isThinking('$ ls -la')).toBe(false)
    expect(isThinking('total 42')).toBe(false)
    expect(isThinking('drwxr-xr-x  5 user staff 160 Jan 1 00:00 src')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isThinking('')).toBe(false)
  })

  it('returns false for ellipsis without parenthesis', () => {
    expect(isThinking('Loading…')).toBe(false)
  })

  it('returns false for parenthesis without ellipsis', () => {
    expect(isThinking('function (x) { return x }')).toBe(false)
  })
})

describe('matchAutopilotRule', () => {
  it('matches (Y/n) prompts', () => {
    const rule = matchAutopilotRule('Do you want to continue? (Y/n) ')
    expect(rule).not.toBeNull()
    expect(rule!.response).toBe('y\r')
  })

  it('matches (y/N) prompts', () => {
    const rule = matchAutopilotRule('Overwrite file? (y/N) ')
    expect(rule).not.toBeNull()
    expect(rule!.response).toBe('y\r')
  })

  it('matches [y/n] prompts', () => {
    const rule = matchAutopilotRule('Proceed? [y/n] ')
    expect(rule).not.toBeNull()
    expect(rule!.response).toBe('y\r')
  })

  it('matches "press enter to continue" with Enter response', () => {
    const rule = matchAutopilotRule('Press Enter to continue')
    expect(rule).not.toBeNull()
    expect(rule!.response).toBe('\r')
  })

  it('matches "Do you want to proceed" plain text (no numbered menu)', () => {
    // Plain text with no "1. Yes" menu — falls through to the y/r rule
    const rule = matchAutopilotRule('Do you want to proceed?')
    expect(rule).not.toBeNull()
    expect(rule!.response).toBe('y\r')
  })

  it('matches "Do you want to proceed" numbered menu with Enter only', () => {
    // Numbered menu — the menu rule fires first, sends just Enter (not y+Enter)
    const screenText = [
      'Permission rule Bash(npm install:*) requires confirmation for this command.',
      'Do you want to proceed?',
      '› 1. Yes',
      '  2. No',
    ].join('\n')
    const rule = matchAutopilotRule(screenText)
    expect(rule).not.toBeNull()
    expect(rule!.response).toBe('\r')
  })

  it('matches Allow permission prompts', () => {
    const rule = matchAutopilotRule('Allow Read access to /etc/hosts? (y/n)')
    expect(rule).not.toBeNull()
    expect(rule!.response).toBe('y\r')
  })

  it('matches Claude Code multi-line menu with "Yes" as option 1', () => {
    const screenText = 'Do you want to create this file?\n  ❯ 1. Yes\n    2. No'
    const rule = matchAutopilotRule(screenText)
    expect(rule).not.toBeNull()
    expect(rule!.response).toBe('\r')
  })

  it('matches Claude Code workspace trust prompt', () => {
    const screenText = [
      'Is this a project you created or one you trust?',
      '❯ 1. Yes, I trust this folder',
      '  2. No, exit',
    ].join('\n')
    const rule = matchAutopilotRule(screenText)
    expect(rule).not.toBeNull()
    expect(rule!.response).toBe('\r')
  })

  it('returns null for non-matching text', () => {
    expect(matchAutopilotRule('$ npm install')).toBeNull()
    expect(matchAutopilotRule('Building project...')).toBeNull()
    expect(matchAutopilotRule('')).toBeNull()
  })

  it('matches case-insensitively', () => {
    const rule = matchAutopilotRule('PRESS ENTER TO CONTINUE')
    expect(rule).not.toBeNull()
  })

  it('returns the first matching rule', () => {
    // "confirm? (y/n)" could match multiple patterns; verify first match wins
    const rule = matchAutopilotRule('confirm? (y/n)')
    expect(rule).not.toBeNull()
    expect(rule!.response).toBe('y\r')
  })

  describe('AUTOPILOT_RULES completeness', () => {
    it('has rules defined', () => {
      expect(AUTOPILOT_RULES.length).toBeGreaterThan(0)
    })

    it('every rule has a pattern and response', () => {
      for (const rule of AUTOPILOT_RULES) {
        expect(rule.pattern).toBeInstanceOf(RegExp)
        expect(typeof rule.response).toBe('string')
        expect(rule.response.length).toBeGreaterThan(0)
      }
    })
  })
})
