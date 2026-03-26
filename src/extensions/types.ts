import type { ComponentType } from 'react'
import type { Tab } from '@/store/tabs'

/** Standard props every tab component receives from the host */
export interface TabProps {
  tabId: string
  groupId: string
  isActive: boolean
  tab: Tab
}

/** A tab type registration from an extension */
export interface TabRegistration {
  type: string
  label: string
  icon: ComponentType<{ className?: string }>
  iconClassName?: string
  component: ComponentType<TabProps>
  fileExtensions?: string[]
}

/** An item an extension contributes to the "new tab" dropdown menu */
export interface NewTabMenuItem {
  label: string
  icon: ComponentType<{ className?: string }>
  iconClassName?: string
  action: (groupId: string) => void
  separator?: 'before' | 'after'
}

/** The extension definition */
export interface Extension {
  id: string
  name: string
  description?: string
  version?: string
  icon?: ComponentType<{ className?: string }>
  sidebar?: ComponentType<{ groupId: string }>
  tabs?: TabRegistration[]
  newTabMenuItems?: NewTabMenuItem[]
  onActivate?: () => void
}
