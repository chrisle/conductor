import { Bell } from 'lucide-react'
import type { Extension } from '../types'
import NotificationsSidebar from './NotificationsSidebar'

export const notificationsExtension: Extension = {
  id: 'notifications',
  name: 'Notifications',
  description: 'Terminal event notifications with badge indicators',
  version: '1.0.0',
  icon: Bell,
  sidebar: NotificationsSidebar,
}
