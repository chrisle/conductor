import { TerminalSquare } from 'lucide-react'
import type { Extension } from '../types'
import WorkSessionsSidebar from './WorkSessionsSidebar'

export { useSessionInfoRegistry } from './session-info-registry'
export type { SessionInfoProvider, SessionInfoContext } from './session-info-registry'

export const workSessionsExtension: Extension = {
  id: 'work-sessions',
  name: 'Sessions',
  description: 'Manage terminal and AI sessions with folders, renaming, and tiling',
  version: '0.1.0',
  icon: TerminalSquare,
  sidebar: WorkSessionsSidebar,
}
