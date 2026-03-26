import React from 'react'
import { Server, ChevronRight } from 'lucide-react'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'

interface SettingsSidebarProps {
  groupId: string
}

const settingsItems = [
  { id: 'terminal-service', label: 'Terminal Service', icon: Server, tabType: 'settings-terminal-service' },
]

export default function SettingsSidebar({ groupId }: SettingsSidebarProps): React.ReactElement {
  const { addTab, setActiveTab, groups } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()

  function openSettingsTab(tabType: string, label: string) {
    const targetGroup = focusedGroupId || groupId
    const group = groups[targetGroup]
    if (group) {
      const existing = group.tabs.find(t => t.type === tabType)
      if (existing) {
        setActiveTab(targetGroup, existing.id)
        return
      }
    }
    addTab(targetGroup, { type: tabType, title: label })
  }

  return (
    <SidebarLayout title="Settings">
      {settingsItems.map(item => (
        <button
          key={item.id}
          onClick={() => openSettingsTab(item.tabType, item.label)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/50 transition-colors group"
        >
          <item.icon className="w-4 h-4 text-zinc-500 group-hover:text-zinc-400 shrink-0" />
          <span className="text-xs text-zinc-300 group-hover:text-zinc-100 truncate">{item.label}</span>
          <ChevronRight className="w-3 h-3 text-zinc-600 ml-auto shrink-0" />
        </button>
      ))}
    </SidebarLayout>
  )
}
