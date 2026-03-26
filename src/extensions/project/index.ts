import { Briefcase } from 'lucide-react'
import type { Extension } from '../types'
import ProjectSidebar from './ProjectSidebar'

export const projectExtension: Extension = {
  id: 'project',
  name: 'Projects',
  description: 'Open and manage workspace projects',
  version: '1.0.0',
  icon: Briefcase,
  sidebar: ProjectSidebar
}
