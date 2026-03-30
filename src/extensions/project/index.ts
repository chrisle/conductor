import { FolderKanban } from 'lucide-react'
import type { Extension } from '../types'
import ProjectSettingsPanel from './ProjectSettingsPanel'

export const projectExtension: Extension = {
  id: 'project',
  name: 'Project',
  description: 'Open and manage workspace projects',
  version: '1.0.0',
  icon: FolderKanban,
  settingsPanel: ProjectSettingsPanel,
}
