import type React from 'react'
import type { Tab } from '@/store/tabs'

export interface TabProps {
  tabId: string
  groupId: string
  isActive: boolean
  tab: Tab
}

export interface TabRegistration {
  type: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconClassName?: string
  component: React.ComponentType<TabProps>
  fileExtensions?: string[]
}

export interface NewTabMenuItem {
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconClassName?: string
  action: (groupId: string) => void
  separator?: 'before' | 'after'
}

export interface SkillDefinition {
  /** Short slug — installed as `conductor-<extensionId>-<slug>` */
  slug: string
  /** Full SKILL.md content */
  content: string
}

export interface SettingsSubPanel {
  /** Stable id used as part of the section key (e.g. "claude-code" → "ai-cli/claude-code") */
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  panel: React.ComponentType<Record<string, never>>
}

export interface Extension {
  id: string
  name: string
  description?: string
  version?: string
  icon?: React.ComponentType<{ className?: string }>
  sidebar?: React.ComponentType<{ groupId: string }>
  tabs?: TabRegistration[]
  newTabMenuItems?: NewTabMenuItem[]
  /** Single settings panel rendered under the extension's top-level nav entry. */
  settingsPanel?: React.ComponentType<Record<string, never>>
  /** Multiple sub-panels rendered as children in the settings sidebar. Takes precedence over settingsPanel. */
  settingsPanels?: SettingsSubPanel[]
  configPanel?: React.ComponentType
  onActivate?: () => void
  skills?: SkillDefinition[]
}
