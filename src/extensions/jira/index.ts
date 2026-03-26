import { SquareKanban } from 'lucide-react'
import type { Extension } from '../types'
import JiraSidebar from './JiraSidebar'
import JiraBoardTab from './JiraBoardTab'

export const jiraExtension: Extension = {
  id: 'jira',
  name: 'Jira',
  description: 'Browse and manage Jira boards and issues',
  version: '1.0.0',
  icon: SquareKanban,
  sidebar: JiraSidebar,
  tabs: [
    {
      type: 'jira-board',
      label: 'Jira Board',
      icon: SquareKanban,
      component: JiraBoardTab,
    },
  ],
}
