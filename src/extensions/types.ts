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

export interface Extension {
  id: string
  name: string
  description?: string
  version?: string
  icon?: React.ComponentType<{ className?: string }>
  sidebar?: React.ComponentType<{ groupId: string }>
  tabs?: TabRegistration[]
  newTabMenuItems?: NewTabMenuItem[]
  settingsPanel?: React.ComponentType<Record<string, never>>
  configPanel?: React.ComponentType
  onActivate?: () => void
}
