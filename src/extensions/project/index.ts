import { Settings } from 'lucide-react'
import type { Extension } from '../types'
import ProjectSettingsTab from './ProjectSettingsTab'

export const projectExtension: Extension = {
  id: 'project',
  name: 'Projects',
  description: 'Open and manage workspace projects',
  version: '1.0.0',
  tabs: [
    {
      type: 'project-settings',
      label: 'Project Settings',
      icon: Settings,
      component: ProjectSettingsTab,
    },
  ],
}
