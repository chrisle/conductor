import { describe, it, expect } from 'vitest'
import { interpolatePromptTemplate } from '../lib/prompt-template'
import { DEFAULT_START_WORK_PROMPT_TEMPLATE } from '../types/app-config'

describe('interpolatePromptTemplate', () => {
  const vars = {
    ticketKey: 'CON-42',
    projectKey: 'CON',
    domain: 'myteam.atlassian.net',
  }

  it('replaces all known placeholders', () => {
    const template = 'Fetch {{ticketKey}} from {{projectKey}} in {{domain}}.'
    const result = interpolatePromptTemplate(template, vars)
    expect(result).toBe('Fetch CON-42 from CON in myteam.atlassian.net.')
  })

  it('leaves unknown placeholders unchanged', () => {
    const template = '{{ticketKey}} and {{unknownVar}}'
    const result = interpolatePromptTemplate(template, vars)
    expect(result).toBe('CON-42 and {{unknownVar}}')
  })

  it('handles template with no placeholders', () => {
    const template = 'Just a plain prompt with no variables.'
    const result = interpolatePromptTemplate(template, vars)
    expect(result).toBe('Just a plain prompt with no variables.')
  })

  it('replaces multiple occurrences of the same placeholder', () => {
    const template = '{{ticketKey}} is {{ticketKey}}'
    const result = interpolatePromptTemplate(template, vars)
    expect(result).toBe('CON-42 is CON-42')
  })

  it('handles empty template', () => {
    const result = interpolatePromptTemplate('', vars)
    expect(result).toBe('')
  })

  it('works with the default template', () => {
    const result = interpolatePromptTemplate(DEFAULT_START_WORK_PROMPT_TEMPLATE, vars)
    expect(result).toContain('CON-42')
    expect(result).toContain('CON')
    expect(result).toContain('myteam.atlassian.net')
    // No unresolved known placeholders should remain
    expect(result).not.toContain('{{ticketKey}}')
    expect(result).not.toContain('{{projectKey}}')
    expect(result).not.toContain('{{domain}}')
  })
})
