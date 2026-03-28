import { Timer } from 'lucide-react'
import type { Extension } from '../types'
import WorkSessionsSidebar from './WorkSessionsSidebar'

export const workSessionsExtension: Extension = {
  id: 'work-sessions',
  name: 'Sessions',
  icon: Timer,
  sidebar: WorkSessionsSidebar,
}
