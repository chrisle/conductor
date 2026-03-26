import { Server } from 'lucide-react'
import type { Extension } from '../types'
import ConductordSidebar from './ConductordSidebar'
import ConductordLogsTab from './ConductordLogsTab'

export const conductordExtension: Extension = {
  id: 'conductord',
  name: 'Conductord',
  description: 'Background service manager and logs',
  version: '1.0.0',
  icon: Server,
  sidebar: ConductordSidebar,
  tabs: [
    {
      type: 'conductord-logs',
      label: 'Conductord Logs',
      icon: Server,
      iconClassName: 'w-3 h-3',
      component: ConductordLogsTab,
    },
  ],
}
