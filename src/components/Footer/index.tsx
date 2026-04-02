import React, { useEffect, useState } from 'react'
import { Activity, GitBranch, Minus, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useSidebarStore } from '@/store/sidebar'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useUIStore } from '@/store/ui'


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
              className={`text-ui-base cursor-pointer justify-center tabular-nums ${Math.abs(zoom - z) < 0.01 ? 'text-blue-400' : ''}`}
            >
              {Math.round(z * 100)}%
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={resetZoom} className="text-ui-base cursor-pointer justify-center">
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
  const { rootPath } = useSidebarStore()
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const [gitStat, setGitStat] = useState<{ insertions: number; deletions: number }>({ insertions: 0, deletions: 0 })
  const [conductord, setConductord] = useState<{ ok: boolean; tmux: number }>({ ok: false, tmux: 0 })

  useEffect(() => {
    if (!rootPath) return
    let cancelled = false
    const fetchGit = async () => {
      const [branch, stat] = await Promise.all([
        window.electronAPI.gitBranch(rootPath),
        window.electronAPI.gitShortstat(rootPath),
      ])
      if (!cancelled) {
        setGitBranch(branch)
        setGitStat(stat)
      }
    }
    fetchGit()
    const id = setInterval(fetchGit, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [rootPath])

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const [ok, tmuxList] = await Promise.all([
          window.electronAPI.conductordHealth(),
          window.electronAPI.conductordGetTmuxSessions(),
        ])
        if (!cancelled) setConductord({ ok, tmux: tmuxList.length })
      } catch {
        if (!cancelled) setConductord({ ok: false, tmux: 0 })
      }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return (
    <div className="flex items-center h-6 bg-zinc-900 border-t border-zinc-800 shrink-0 text-ui-sm select-none overflow-hidden">
      <button
        onClick={() => useUIStore.getState().setGoToOpen(true)}
        className="flex items-center gap-1.5 text-white hover:text-zinc-300 transition-colors cursor-pointer px-2"
      >
        <span>Current directory:</span>
        <span className="truncate max-w-[300px]">
          {rootPath ? rootPath.replace(/^\/Users\/[^/]+/, '~') : '—'}
        </span>
      </button>
      <Separator orientation="vertical" className="h-3 bg-zinc-800" />

      {gitBranch && (
        <>
          <button
            onClick={() => {
              const tabsState = useTabsStore.getState()
              const layoutStore = useLayoutStore.getState()
              const layoutGroupIds = new Set(layoutStore.getAllGroupIds())
              const focusedGroupId = layoutStore.focusedGroupId

              // Check if git-graph tab already exists
              for (const [gid, group] of Object.entries(tabsState.groups)) {
                const existing = group.tabs.find(t => t.type === 'git-graph')
                if (existing && layoutGroupIds.has(gid)) {
                  tabsState.setActiveTab(gid, existing.id)
                  layoutStore.setFocusedGroup(gid)
                  return
                }
              }

              let targetGroup = focusedGroupId && tabsState.groups[focusedGroupId] && layoutGroupIds.has(focusedGroupId)
                ? focusedGroupId
                : [...layoutGroupIds].find(gid => tabsState.groups[gid]) || Object.keys(tabsState.groups)[0]
              if (!targetGroup) targetGroup = tabsState.createGroup()
              tabsState.addTab(targetGroup, { type: 'git-graph', title: 'Git Graph', filePath: rootPath || undefined })
            }}
            className="flex items-center gap-1.5 text-white hover:text-zinc-300 transition-colors cursor-pointer px-2"
          >
            <GitBranch className="w-2.5 h-2.5" />
            <span>{gitBranch}</span>
          </button>
          {(gitStat.insertions > 0 || gitStat.deletions > 0) && (
            <Item>
              {gitStat.insertions > 0 && <span className="text-emerald-400">+{gitStat.insertions}</span>}
              {gitStat.deletions > 0 && <span className="text-red-400">-{gitStat.deletions}</span>}
            </Item>
          )}
          <Separator orientation="vertical" className="h-3 bg-zinc-800" />
        </>
      )}

      <div className="flex-1" />

      <Item>
        <Activity className={`w-2.5 h-2.5 ${conductord.ok ? 'text-emerald-500' : 'text-red-500'}`} />
        <span className={conductord.ok ? 'text-zinc-500' : 'text-red-500'}>
          {conductord.ok ? `${conductord.tmux} tmux` : 'conductord offline'}
        </span>
      </Item>
      <Separator orientation="vertical" className="h-3 bg-zinc-800" />

      <ZoomControl />
      <Separator orientation="vertical" className="h-3 bg-zinc-800" />

    </div>
  )
}
