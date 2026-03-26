/**
 * @conductor/extension-sdk
 *
 * Type definitions and utilities for building Conductor extensions.
 * External extensions import these types to get autocomplete and type safety.
 */

import type { ComponentType } from 'react'

/** Standard props every tab component receives from the host */
export interface TabProps {
  tabId: string
  groupId: string
  isActive: boolean
  tab: {
    id: string
    type: string
    title: string
    filePath?: string
    url?: string
    isDirty?: boolean
    isThinking?: boolean
    content?: string
    initialCommand?: string
  }
}

/** A tab type registration from an extension */
export interface TabRegistration {
  type: string
  label: string
  icon: ComponentType<{ className?: string }>
  component: ComponentType<TabProps>
  fileExtensions?: string[]
}

/** An item an extension contributes to the "new tab" dropdown menu */
export interface NewTabMenuItem {
  label: string
  icon: ComponentType<{ className?: string }>
  action: (groupId: string) => void
  separator?: 'before' | 'after'
}

/** The extension definition — the default export of every extension bundle */
export interface Extension {
  id: string
  name: string
  icon?: ComponentType<{ className?: string }>
  sidebar?: ComponentType<{ groupId: string }>
  tabs?: TabRegistration[]
  newTabMenuItems?: NewTabMenuItem[]
  onActivate?: () => void
}

/**
 * Helper to define an extension with full type inference.
 *
 * Usage:
 * ```ts
 * export default defineExtension({
 *   id: 'my-extension',
 *   name: 'My Extension',
 *   tabs: [...]
 * })
 * ```
 */
export function defineExtension(extension: Extension): Extension {
  return extension
}
