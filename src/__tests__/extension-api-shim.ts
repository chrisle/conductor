/**
 * Test shim for @conductor/extension-api
 * Provides real store instances without pulling in UI components.
 */
export { useTabsStore } from '../store/tabs'
export { useLayoutStore } from '../store/layout'
export { useSidebarStore } from '../store/sidebar'
export { useConfigStore } from '../store/config'
export { useProjectStore } from '../store/project'
export { useWorkSessionsStore } from '../store/work-sessions'
export { cn } from '../lib/utils'

// Stubs for functions/objects not needed in unit tests
export function createTerminal() { return Promise.resolve({ isNew: true }) }
export function killTerminal() { return Promise.resolve() }
export function setAutoPilot() {}
export function getThinkingState() { return { thinking: false } }
export function stripAnsi(s: string) { return s }
export const ui = {}
