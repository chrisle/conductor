import { Briefcase } from 'lucide-react'
import type { Extension } from '../types'
import ProjectSidebar from './ProjectSidebar'

export const projectExtension: Extension = {
  id: 'project',
  name: 'Projects',
  icon: Briefcase,
  sidebar: ProjectSidebar
}
