import { describe, it, expect } from 'vitest'
import { extractPreviewLines } from '../extensions/work-sessions/TerminalPreview'

describe('extractPreviewLines', () => {
  it('returns the last N lines of plain text', () => {
    const input = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')
    const result = extractPreviewLines(input, 5)
    expect(result).toEqual(['line 16', 'line 17', 'line 18', 'line 19', 'line 20'])
  })

  it('strips ANSI escape codes', () => {
    const input = '\x1b[32mgreen text\x1b[0m\n\x1b[31mred line\x1b[0m'
    const result = extractPreviewLines(input, 5)
    expect(result).toEqual(['green text', 'red line'])
  })

  it('skips trailing blank lines', () => {
    const input = 'line 1\nline 2\nline 3\n\n\n'
    const result = extractPreviewLines(input, 5)
    expect(result).toEqual(['line 1', 'line 2', 'line 3'])
  })

  it('returns empty array for empty string', () => {
    expect(extractPreviewLines('')).toEqual([])
  })

  it('returns empty array for whitespace-only input', () => {
    expect(extractPreviewLines('   \n  \n\n')).toEqual([])
  })

  it('returns all lines when fewer than requested count', () => {
    const input = 'alpha\nbeta\ngamma'
    const result = extractPreviewLines(input, 10)
    expect(result).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('defaults to 12 lines', () => {
    const input = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')
    const result = extractPreviewLines(input)
    expect(result).toHaveLength(12)
    expect(result[0]).toBe('line 19')
    expect(result[11]).toBe('line 30')
  })

  it('handles carriage returns in ANSI stripping', () => {
    const input = 'prompt\r\n$ command\r\noutput'
    const result = extractPreviewLines(input, 5)
    expect(result).toEqual(['prompt', '$ command', 'output'])
  })

  it('preserves indentation and whitespace within lines', () => {
    const input = '  indented\n    double\nnormal'
    const result = extractPreviewLines(input, 5)
    expect(result).toEqual(['  indented', '    double', 'normal'])
  })

  it('handles complex ANSI sequences (cursor movement, charset)', () => {
    const input = '\x1b[2A\x1b(Bhello world\x1b[1B\nline two'
    const result = extractPreviewLines(input, 5)
    expect(result).toEqual(['hello world', 'line two'])
  })
})
