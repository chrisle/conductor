import { Settings, Server, ScrollText } from 'lucide-react'
import type { Extension } from '../types'
import SettingsSidebar from './SettingsSidebar'
import TerminalServiceTab from './TerminalServiceTab'
import ConductordLogsTab from './ConductordLogsTab'

export const settingsExtension: Extension = {
  id: 'settings',
  name: 'Settings',
  description: 'Configure application preferences, manage extensions, and view service logs',
  version: '1.0.0',
  icon: Settings,
  sidebar: SettingsSidebar,
  tabs: [
    {
      type: 'settings-terminal-service',
      label: 'Conductor Daemon',
      icon: Server,
      component: TerminalServiceTab,
    },
    {
      type: 'conductord-logs',
      label: 'Conductord Logs',
      icon: ScrollText,
      iconClassName: 'w-3 h-3',
      component: ConductordLogsTab,
    },
  ],
}
