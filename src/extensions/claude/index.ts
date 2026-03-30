import ClaudeIcon from '@/components/ui/ClaudeIcon'
import type { Extension } from '../types'
import ClaudeTab from './components/ClaudeTab'
import ClaudeSettingsPanel from './components/ClaudeSettingsPanel'
import { useTabsStore } from '@/store/tabs'
import { useSidebarStore } from '@/store/sidebar'

/** Generate a human-readable tmux session name like claude-1, claude-2, etc. */
function nextClaudeSessionId(): string {
  const groups = useTabsStore.getState().groups
  const existing = new Set<string>()
  for (const group of Object.values(groups)) {
    for (const tab of group.tabs) {
      if (tab.id.startsWith('claude-')) existing.add(tab.id)
    }
  }
  let n = 1
  while (existing.has(`claude-${n}`)) n++
  return `claude-${n}`
}

export const claudeExtension: Extension = {
  id: 'claude',
  name: 'Claude',
  description: 'AI assistant powered by Anthropic',
  version: '1.0.0',
  icon: ClaudeIcon,
  settingsPanel: ClaudeSettingsPanel,
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
          id: nextClaudeSessionId(),
          type: 'claude',
          title: 'Claude',
          filePath: cwd,
          initialCommand: 'claude\n',
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
          id: nextClaudeSessionId(),
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
          id: nextClaudeSessionId(),
          type: 'claude',
          title: 'Claude',
          filePath: cwd,
          initialCommand: 'claude --resume\n'
        })
      }
    }
  ]
}
