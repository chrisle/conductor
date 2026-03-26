import { Settings, Server } from 'lucide-react'
import type { Extension } from '../types'
import SettingsSidebar from './SettingsSidebar'
import TerminalServiceTab from './TerminalServiceTab'

export const settingsExtension: Extension = {
  id: 'settings',
  name: 'Settings',
  description: 'Configure application preferences',
  version: '1.0.0',
  icon: Settings,
  sidebar: SettingsSidebar,
  tabs: [
    {
      type: 'settings-terminal-service',
      label: 'Terminal Service',
      icon: Server,
      component: TerminalServiceTab,
    },
  ],
}
