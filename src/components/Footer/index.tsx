import React, { useEffect, useRef, useState } from 'react'
import { Activity, GitBranch, Minus, Plus, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useSidebarStore } from '@/store/sidebar'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useUIStore } from '@/store/ui'
import { useClaudeUsageStore } from '@/store/claude-usage'
import { scrapeNow } from '@/lib/claude-usage-scraper'


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

function ClaudeUsageIndicator() {
  const { usage, scraping, error } = useClaudeUsageStore()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!usage && !scraping && !error) return null

  // Show session % in the label, fall back to all-models %
  const displayPercent = usage?.sessionPercent ?? usage?.percentUsed
  const label = scraping
    ? 'Checking...'
    : error
      ? 'Usage: error'
      : displayPercent != null
        ? `Usage: ${displayPercent}%`
        : 'Usage: --'

  const timeAgo = usage?.lastUpdated
    ? formatTimeAgo(usage.lastUpdated)
    : null

  // Color based on all-models percentage (the weekly cap)
  const colorPercent = usage?.percentUsed
  const dotColor = colorPercent != null
    ? colorPercent >= 90 ? 'bg-red-400' : colorPercent >= 70 ? 'bg-amber-400' : 'bg-emerald-400'
    : error ? 'bg-red-400' : 'bg-zinc-500'
  const textColor = colorPercent != null
    ? colorPercent >= 90 ? 'text-red-400' : colorPercent >= 70 ? 'text-amber-400' : 'text-emerald-400'
    : 'text-zinc-500'

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer px-2"
      >
        {scraping ? (
          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
        ) : (
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
        )}
        <span className={textColor}>{label}</span>
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 right-0 bg-zinc-900 border border-zinc-700 rounded-md text-xs w-[280px] p-3 shadow-xl z-50">
          {usage?.tiers && usage.tiers.length > 0 ? (
            <div className="space-y-2.5">
              {usage.tiers.map((tier, i) => {
                const barColor = tier.percent >= 90 ? 'bg-red-400' : tier.percent >= 70 ? 'bg-amber-400' : 'bg-emerald-400'
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-zinc-300 font-medium">{tier.label}</span>
                      <span className="text-zinc-400 tabular-nums">{tier.percent}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-zinc-700 overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(tier.percent, 100)}%` }} />
                    </div>
                    {(tier.resets || tier.spent) && (
                      <div className="flex items-center justify-between gap-2 mt-1">
                        {tier.resets && <span className="text-zinc-500">{tier.resets}</span>}
                        {tier.spent && <span className="text-zinc-500">{tier.spent}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="flex items-center justify-between pt-1">
                {timeAgo && <span className="text-zinc-600">{timeAgo}</span>}
                <button
                  onClick={(e) => { e.stopPropagation(); scrapeNow() }}
                  className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${scraping ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          ) : error ? (
            <div className="text-red-400">Error: {error}</div>
          ) : (
            <div className="text-zinc-500">Claude usage</div>
          )}
        </div>
      )}
    </div>
  )
}

function formatTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function Footer(): React.ReactElement {
  const { rootPath } = useSidebarStore()
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const [gitStat, setGitStat] = useState<{ insertions: number; deletions: number }>({ insertions: 0, deletions: 0 })
  const [conductord, setConductord] = useState<{ ok: boolean; sessions: number }>({ ok: false, sessions: 0 })

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
        const [ok, sessionList] = await Promise.all([
          window.electronAPI.conductordHealth(),
          window.electronAPI.conductordGetSessions(),
        ])
        if (!cancelled) setConductord({ ok, sessions: sessionList.filter((s: { dead: boolean }) => !s.dead).length })
      } catch {
        if (!cancelled) setConductord({ ok: false, sessions: 0 })
      }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return (
    <div className="flex items-center h-6 bg-zinc-900 border-t border-zinc-800 shrink-0 text-ui-sm select-none overflow-visible">
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

      <ClaudeUsageIndicator />
      <Separator orientation="vertical" className="h-3 bg-zinc-800" />

      <Item>
        <Activity className={`w-2.5 h-2.5 ${conductord.ok ? 'text-emerald-500' : 'text-red-500'}`} />
        <span className={conductord.ok ? 'text-zinc-500' : 'text-red-500'}>
          {conductord.ok ? `${conductord.sessions} sessions` : 'conductord offline'}
        </span>
      </Item>
      <Separator orientation="vertical" className="h-3 bg-zinc-800" />

      <ZoomControl />
      <Separator orientation="vertical" className="h-3 bg-zinc-800" />

    </div>
  )
}
