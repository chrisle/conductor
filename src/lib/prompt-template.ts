export interface PromptTemplateVars {
  ticketKey: string
  projectKey: string
  domain: string
}

/**
 * Replaces {{variableName}} placeholders in a prompt template with actual values.
 * Unknown placeholders are left as-is so the user sees them and can fix the template.
 */
export function interpolatePromptTemplate(
  template: string,
  vars: PromptTemplateVars,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in vars) return vars[key as keyof PromptTemplateVars]
    return match
  })
}
