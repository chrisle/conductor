import { Globe } from 'lucide-react'
import type { Extension } from '../types'
import BrowserTab from './BrowserTab'
import { useTabsStore } from '@/store/tabs'

export const browserExtension: Extension = {
  id: 'browser',
  name: 'Browser',
  description: 'Embedded web browser',
  version: '1.0.0',
  tabs: [
    {
      type: 'browser',
      label: 'Browser',
      icon: Globe,
      component: BrowserTab
    }
  ],
  newTabMenuItems: [
    {
      label: 'Browser',
      icon: Globe,
      iconClassName: 'w-3.5 h-3.5 text-blue-400 shrink-0',
      action: (groupId: string) => {
        useTabsStore.getState().addTab(groupId, {
          type: 'browser',
          title: 'Browser',
          url: 'https://google.com'
        })
      }
    }
  ]
}
