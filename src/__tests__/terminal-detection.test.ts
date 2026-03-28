import { describe, it, expect } from 'vitest'
import { stripAnsi, isThinking, getThinkingState } from '../lib/terminal-detection'
import { matchPrompt } from '../extensions/claude/pty-handlers/useAnswerYes'

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
  it('detects thinking with minutes, seconds, and ↑ tokens', () => {
    expect(isThinking('✳ Zigzagging… (4m 35s · ↑ 611 tokens)')).toBe(true)
  })

  it('detects thinking with ANSI codes around it', () => {
    expect(isThinking('\x1b[33m✳ Planning… (2m 12s · ↑ 42 tokens)\x1b[0m')).toBe(true)
  })

  it('returns true when tokens are ↓ (regex matches both arrows)', () => {
    expect(isThinking('✳ Responding… (4m 35s · ↓ 611 tokens)')).toBe(true)
  })

  it('returns false for normal terminal output', () => {
    expect(isThinking('$ ls -la')).toBe(false)
    expect(isThinking('total 42')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isThinking('')).toBe(false)
  })

  it('returns true for seconds-only format (minutes component is optional)', () => {
    expect(isThinking('⠋ Reasoning… (12s · ↑ 42 tokens)')).toBe(true)
  })
})

describe('getThinkingState', () => {
  it('returns thinking:true with time when thinking', () => {
    const state = getThinkingState('✳ Planning… (4m 35s · ↑ 611 tokens)')
    expect(state.thinking).toBe(true)
    expect(state.time).toBe('4m 35s')
  })

  it('matches seconds-only format with ↓ arrow (minutes are optional)', () => {
    const state = getThinkingState('(53s · ↓ 778 tokens)')
    expect(state.thinking).toBe(true)
    expect(state.time).toBe('53s')
  })

  it('returns done:true for completion messages', () => {
    const state = getThinkingState('Cooked for 12s')
    expect(state.thinking).toBe(false)
    expect(state.done).toBe(true)
  })

  it('done:true takes precedence over thinking pattern', () => {
    const state = getThinkingState('Finished for 5s (4m 1s · ↑ 100 tokens)')
    expect(state.done).toBe(true)
    expect(state.thinking).toBe(false)
  })

  it('returns the last match for same-line rewrites', () => {
    const text = '(1m 10s · ↑ 50 tokens) (2m 30s · ↑ 100 tokens)'
    const state = getThinkingState(text)
    expect(state.thinking).toBe(true)
    expect(state.time).toBe('2m 30s')
  })

  it('returns thinking:false when no match and no done', () => {
    const state = getThinkingState('$ echo hello')
    expect(state.thinking).toBe(false)
    expect(state.done).toBeUndefined()
  })

  it('strips ANSI before matching', () => {
    const state = getThinkingState('\x1b[33m(3m 5s · ↑ 200 tokens)\x1b[0m')
    expect(state.thinking).toBe(true)
    expect(state.time).toBe('3m 5s')
  })

  it('detects thinking with k-suffix token count', () => {
    const state = getThinkingState('(6m 1s · ↑ 4.8k tokens · thinking with medium effort)')
    expect(state.thinking).toBe(true)
    expect(state.time).toBe('6m 1s')
  })
})

describe('matchPrompt', () => {
  it('matches (Y/n) prompts', () => {
    expect(matchPrompt('Do you want to continue? (Y/n) ')).toBe('y\r')
  })

  it('matches (y/N) prompts', () => {
    expect(matchPrompt('Overwrite file? (y/N) ')).toBe('y\r')
  })

  it('matches [y/n] prompts', () => {
    expect(matchPrompt('Proceed? [y/n] ')).toBe('y\r')
  })

  it('matches "press enter to continue" with Enter response', () => {
    expect(matchPrompt('Press Enter to continue')).toBe('\r')
  })

  it('matches numbered menu with "1. Yes" — sends Enter only', () => {
    const screenText = [
      'Permission rule Bash(npm install:*) requires confirmation for this command.',
      'Do you want to proceed?',
      '› 1. Yes',
      '  2. No',
    ].join('\n')
    expect(matchPrompt(screenText)).toBe('\r')
  })

  it('matches Allow permission prompts', () => {
    expect(matchPrompt('Allow Read access to /etc/hosts? (y/n)')).toBe('y\r')
  })

  it('matches Claude Code multi-line menu with "Yes" as option 1', () => {
    expect(matchPrompt('Do you want to create this file?\n  ❯ 1. Yes\n    2. No')).toBe('\r')
  })

  it('matches Claude Code workspace trust prompt', () => {
    const screenText = [
      'Is this a project you created or one you trust?',
      '❯ 1. Yes, I trust this folder',
      '  2. No, exit',
    ].join('\n')
    expect(matchPrompt(screenText)).toBe('\r')
  })

  it('returns null for non-matching text', () => {
    expect(matchPrompt('$ npm install')).toBeNull()
    expect(matchPrompt('Building project...')).toBeNull()
    expect(matchPrompt('')).toBeNull()
  })

  it('matches case-insensitively', () => {
    expect(matchPrompt('PRESS ENTER TO CONTINUE')).toBe('\r')
  })

  it('"1. Yes" rule fires before y/n rules', () => {
    const screenText = '1. Yes\n(y/N)'
    expect(matchPrompt(screenText)).toBe('\r')
  })
})
