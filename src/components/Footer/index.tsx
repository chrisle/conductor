import React, { useEffect, useState } from 'react'
import { FileText, GitBranch, Minus, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import { useUIStore } from '@/store/ui'
import { extensionRegistry } from '@/extensions'

function Item({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-default px-2">
      {children}
    </span>
  )
}

const ZOOM_PRESETS = [0.75, 0.9, 1.0, 1.25, 1.5]

function ZoomControl() {
  const { zoom, zoomIn, zoomOut, setZoom, resetZoom } = useUIStore()
  const pct = Math.round(zoom * 100)
  return (
    <span className="flex items-center gap-0.5 text-zinc-500 px-1">
      <button onClick={zoomOut} className="hover:text-zinc-300 transition-colors p-0.5 rounded hover:bg-zinc-800">
        <Minus className="w-2.5 h-2.5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="hover:text-zinc-300 transition-colors px-1 rounded hover:bg-zinc-800 tabular-nums min-w-[36px] text-center"
          >
            {pct}%
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="min-w-[100px] bg-zinc-900 border-zinc-700">
          {ZOOM_PRESETS.map(z => (
            <DropdownMenuItem
              key={z}
              onClick={() => setZoom(z)}
              className={`text-xs cursor-pointer justify-center tabular-nums ${Math.abs(zoom - z) < 0.01 ? 'text-blue-400' : ''}`}
            >
              {Math.round(z * 100)}%
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={resetZoom} className="text-xs cursor-pointer justify-center">
            Reset
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button onClick={zoomIn} className="hover:text-zinc-300 transition-colors p-0.5 rounded hover:bg-zinc-800">
        <Plus className="w-2.5 h-2.5" />
      </button>
    </span>
  )
}

export default function Footer(): React.ReactElement {
  const { groups } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const { rootPath } = useSidebarStore()
  const [gitBranch, setGitBranch] = useState<string | null>(null)

  useEffect(() => {
    if (!rootPath) return
    let cancelled = false
    const fetch = async () => {
      const branch = await window.electronAPI.gitBranch(rootPath)
      if (!cancelled) setGitBranch(branch)
    }
    fetch()
    const id = setInterval(fetch, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [rootPath])

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

      {gitBranch && (
        <>
          <Item>
            <Badge variant="outline" className="h-4 px-1.5 gap-1 text-[10px] text-fuchsia-400 border-fuchsia-900 bg-fuchsia-950/30">
              <GitBranch className="w-2.5 h-2.5" />
              {gitBranch}
            </Badge>
          </Item>
          <Separator orientation="vertical" className="h-3 bg-zinc-800" />
        </>
      )}

      {splitCount > 1 && (
        <>
          <Item>{splitCount} panes</Item>
          <Separator orientation="vertical" className="h-3 bg-zinc-800" />
        </>
      )}

      <Item>{totalTabs} tab{totalTabs !== 1 ? 's' : ''}</Item>
      <Separator orientation="vertical" className="h-3 bg-zinc-800" />

      <ZoomControl />
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
