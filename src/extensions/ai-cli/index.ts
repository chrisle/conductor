import ClaudeIcon from '@/components/ui/ClaudeIcon'
import CodexIcon from '@/components/ui/CodexIcon'
import type { Extension } from '../types'
import ClaudeCodeTab from './components/ClaudeCodeTab'
import CodexTab from './components/CodexTab'
import AiCliSettingsPanel from './components/AiCliSettingsPanel'
import { useTabsStore } from '@/store/tabs'
import { useSidebarStore } from '@/store/sidebar'
import { nextSessionId } from '@/lib/session-id'

export const aiCliExtension: Extension = {
  id: 'ai-cli',
  name: 'AI CLI',
  description: 'AI coding assistants: Claude Code and Codex',
  version: '1.0.0',
  icon: ClaudeIcon,
  settingsPanel: AiCliSettingsPanel,
  tabs: [
    {
      type: 'claude-code',
      label: 'Claude Code',
      icon: ClaudeIcon,
      iconClassName: 'w-3 h-3 text-[#D97757]',
      component: ClaudeCodeTab,
    },
    {
      type: 'codex',
      label: 'Codex',
      icon: CodexIcon,
      iconClassName: 'w-3 h-3 text-[#10a37f]',
      component: CodexTab,
    },
  ],
  newTabMenuItems: [
    {
      label: 'Claude Code',
      icon: ClaudeIcon,
      iconClassName: 'w-3.5 h-3.5 text-[#D97757] shrink-0',
      action: (groupId: string) => {
        const cwd = useSidebarStore.getState().rootPath || undefined
        useTabsStore.getState().addTab(groupId, {
          id: nextSessionId('claude-code'),
          type: 'claude-code',
          title: 'Claude Code',
          filePath: cwd,
          initialCommand: 'claude\n',
        })
      },
      separator: 'before',
    },
    {
      label: 'Claude Code (continue)',
      icon: ClaudeIcon,
      iconClassName: 'w-3.5 h-3.5 text-[#D97757] shrink-0',
      action: (groupId: string) => {
        const cwd = useSidebarStore.getState().rootPath || undefined
        useTabsStore.getState().addTab(groupId, {
          id: nextSessionId('claude-code'),
          type: 'claude-code',
          title: 'Claude Code',
          filePath: cwd,
          initialCommand: 'claude --continue\n',
        })
      },
    },
    {
      label: 'Claude Code (resume)',
      icon: ClaudeIcon,
      iconClassName: 'w-3.5 h-3.5 text-[#D97757] shrink-0',
      action: (groupId: string) => {
        const cwd = useSidebarStore.getState().rootPath || undefined
        useTabsStore.getState().addTab(groupId, {
          id: nextSessionId('claude-code'),
          type: 'claude-code',
          title: 'Claude Code',
          filePath: cwd,
          initialCommand: 'claude --resume\n',
        })
      },
    },
    {
      label: 'Codex',
      icon: CodexIcon,
      iconClassName: 'w-3.5 h-3.5 text-[#10a37f] shrink-0',
      action: (groupId: string) => {
        const cwd = useSidebarStore.getState().rootPath || undefined
        useTabsStore.getState().addTab(groupId, {
          id: nextSessionId('codex'),
          type: 'codex',
          title: 'Codex',
          filePath: cwd,
          initialCommand: 'codex\n',
        })
      },
      separator: 'before',
    },
  ],
}
