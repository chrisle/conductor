import { Terminal } from 'lucide-react'
import type { Extension } from '../types'
import TerminalTab from './TerminalTab'
import { useTabsStore } from '@/store/tabs'
import { resolveTerminalCwd, saveTerminalCwd } from '@/lib/terminal-cwd'

export const terminalExtension: Extension = {
  id: 'terminal',
  name: 'Terminal',
  description: 'Integrated terminal emulator',
  version: '1.0.0',
  icon: Terminal,
  tabs: [
    {
      type: 'terminal',
      label: 'Terminal',
      icon: Terminal,
      iconClassName: 'w-3 h-3',
      component: TerminalTab
    }
  ],
  newTabMenuItems: [
    {
      label: 'Terminal',
      icon: Terminal,
      iconClassName: 'w-3.5 h-3.5 text-green-400 shrink-0',
      action: (groupId: string) => {
        const cwd = resolveTerminalCwd()
        saveTerminalCwd(cwd)
        useTabsStore.getState().addTab(groupId, {
          type: 'terminal',
          title: 'Terminal',
          filePath: cwd
        })
      }
    }
  ]
}
