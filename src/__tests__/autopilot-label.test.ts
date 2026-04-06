import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('ClaudeCodeTab autopilot label', () => {
  const source = readFileSync(
    resolve(__dirname, '../extensions/ai-cli/components/ClaudeCodeTab.tsx'),
    'utf-8',
  )

  it('uses "Auto Pilot" as the toggle label', () => {
    expect(source).toContain('label="Auto Pilot"')
  })

  it('does not contain the old profanity label', () => {
    expect(source).not.toContain('Fuck it')
  })
})
