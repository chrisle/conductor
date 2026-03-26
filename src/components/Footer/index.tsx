import React from 'react'
import { FileText } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import { extensionRegistry } from '@/extensions'

function Item({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-default px-2">
      {children}
    </span>
  )
}

export default function Footer(): React.ReactElement {
  const { groups } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const { rootPath } = useSidebarStore()

  const focusedGroup = focusedGroupId ? groups[focusedGroupId] : null
  const activeTab = focusedGroup?.tabs.find(t => t.id === focusedGroup.activeTabId)

  const tabIcon = () => {
    if (!activeTab) return null
    const Icon = extensionRegistry.getTabIcon(activeTab.type)
    if (!Icon) return <FileText className="w-3 h-3" />
    return <Icon className="w-3 h-3" />
  }

  const allGroups = Object.values(groups)
  const totalTabs = allGroups.reduce((n, g) => n + g.tabs.length, 0)
  const splitCount = allGroups.length

  return (
    <div className="flex items-center h-6 bg-zinc-900 border-t border-zinc-800 shrink-0 text-[11px] select-none overflow-hidden">
      <Item>
        <span className="text-zinc-600 truncate max-w-[300px]">
          {rootPath ? rootPath.replace(/^\/Users\/[^/]+/, '~') : '—'}
        </span>
      </Item>
      <Separator orientation="vertical" className="h-3 bg-zinc-800" />
      {activeTab && (
        <>
          <Item>
            {tabIcon()}
            <span>{activeTab.title}</span>
          </Item>
          <Separator orientation="vertical" className="h-3 bg-zinc-800" />
        </>
      )}

      {activeTab?.type === 'text' && activeTab.filePath && (
        <>
          <Item>
            <span className="text-zinc-600">{activeTab.filePath.replace(/^\/Users\/[^/]+/, '~')}</span>
          </Item>
          <Separator orientation="vertical" className="h-3 bg-zinc-800" />
        </>
      )}

      {activeTab?.type === 'browser' && activeTab.url && (
        <>
          <Item>
            <span className="text-zinc-600 truncate max-w-[240px]">{activeTab.url}</span>
          </Item>
          <Separator orientation="vertical" className="h-3 bg-zinc-800" />
        </>
      )}

      <div className="flex-1" />

      {splitCount > 1 && (
        <>
          <Item>{splitCount} panes</Item>
          <Separator orientation="vertical" className="h-3 bg-zinc-800" />
        </>
      )}

      <Item>{totalTabs} tab{totalTabs !== 1 ? 's' : ''}</Item>
      <Separator orientation="vertical" className="h-3 bg-zinc-800" />

      <Item>
        <span className="text-zinc-600">⌘W</span> close
      </Item>
      <Item>
        <span className="text-zinc-600">⌘T</span> new tab
      </Item>
    </div>
  )
}
