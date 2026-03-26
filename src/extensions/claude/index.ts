import ClaudeIcon from '@/components/ui/ClaudeIcon'
import type { Extension } from '../types'
import ClaudeTab from './ClaudeTab'
import ClaudeSidebar from './ClaudeSidebar'
import { useTabsStore } from '@/store/tabs'
import { useSidebarStore } from '@/store/sidebar'

export const claudeExtension: Extension = {
  id: 'claude',
  name: 'Claude',
  description: 'AI assistant powered by Anthropic',
  version: '1.0.0',
  icon: ClaudeIcon,
  sidebar: ClaudeSidebar,
  tabs: [
    {
      type: 'claude',
      label: 'Claude',
      icon: ClaudeIcon,
      iconClassName: 'w-3 h-3 text-[#D97757]',
      component: ClaudeTab
    }
  ],
  newTabMenuItems: [
    {
      label: 'Claude',
      icon: ClaudeIcon,
      iconClassName: 'w-3.5 h-3.5 text-[#D97757] shrink-0',
      action: (groupId: string) => {
        const cwd = useSidebarStore.getState().rootPath || undefined
        useTabsStore.getState().addTab(groupId, {
          type: 'claude',
          title: 'Claude',
          filePath: cwd
        })
      },
      separator: 'before'
    },
    {
      label: 'Claude (continue)',
      icon: ClaudeIcon,
      iconClassName: 'w-3.5 h-3.5 text-[#D97757] shrink-0',
      action: (groupId: string) => {
        const cwd = useSidebarStore.getState().rootPath || undefined
        useTabsStore.getState().addTab(groupId, {
          type: 'claude',
          title: 'Claude',
          filePath: cwd,
          initialCommand: 'claude --continue\n'
        })
      }
    },
    {
      label: 'Claude (resume)',
      icon: ClaudeIcon,
      iconClassName: 'w-3.5 h-3.5 text-[#D97757] shrink-0',
      action: (groupId: string) => {
        const cwd = useSidebarStore.getState().rootPath || undefined
        useTabsStore.getState().addTab(groupId, {
          type: 'claude',
          title: 'Claude',
          filePath: cwd,
          initialCommand: 'claude --resume\n'
        })
      }
    }
  ]
}
