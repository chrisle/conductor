import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, ChevronRight, Columns3, Copy, Eye, Folder, FolderOpen, FolderPlus, GitBranch, Hash, Info, Key, LayoutGrid, Pencil, Rows3, Search, Square, Terminal, Trash2 } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'
import { getSessionTitle, setSessionTitle, clearSessionTitle } from '@/lib/session-titles'
import { useWorkSessionsStore } from '@/store/work-sessions'
import { useTabsStore } from '@/store/tabs'
import { useConfigStore } from '@/store/config'
import { useLayoutStore, type LayoutNode } from '@/store/layout'
import { buildTileLayout, type TileMode } from '@/lib/tile-layout'
import { useProjectStore, type SessionFolder } from '@/store/project'
import type { WorkSession } from '@/types/work-session'
import { useSessionInfoRegistry, type SessionInfoContext } from './session-info-registry'
import TerminalPreview from './TerminalPreview'

// ── Types ──────────────────────────────────────────────

interface ConductorSession {
  name: string
  connected: boolean
  command: string
  cwd: string
}

interface EnrichedSession {
  session: ConductorSession
  workSession: WorkSession | null
  ticketKey: string | null
  hasOpenTab: boolean
}

// ── Helpers ────────────────────────────────────────────

function ticketKeyFromSessionName(name: string): string | null {
  if (name.startsWith('t-')) return name.slice(2).toUpperCase()
  return null
}

function sessionLabel(s: ConductorSession): string {
  const custom = getSessionTitle(s.name)
  if (custom) return custom
  return s.name
}

function sessionIcon(s: ConductorSession): typeof Bot {
  const cmd = s.command.toLowerCase()
  if (cmd === 'claude' || s.name.startsWith('claude-code-')) return Bot
  if (cmd === 'codex' || s.name.startsWith('codex-')) return Bot
  return Terminal
}

function sessionIconColor(s: ConductorSession): string {
  const cmd = s.command.toLowerCase()
  if (cmd === 'claude' || s.name.startsWith('claude-code-')) return 'text-orange-400'
  if (cmd === 'codex' || s.name.startsWith('codex-')) return 'text-emerald-400'
  return 'text-zinc-400'
}

export function buildTileTree(ids: string[], depth: number): LayoutNode {
  if (ids.length === 1) return { type: 'leaf', groupId: ids[0] }
  const containerType = depth % 2 === 0 ? 'row' : 'column'
  return {
    type: containerType,
    children: ids.map(id => ({
      node: { type: 'leaf' as const, groupId: id },
      size: 1,
    })),
  }
}

// ── Data hook ──────────────────────────────────────────

function useConductorSessions(intervalMs = 5_000) {
  const [sessions, setSessions] = useState<ConductorSession[]>([])
  const workSessions = useWorkSessionsStore(s => s.sessions)
  const groups = useTabsStore(s => s.groups)

  const refresh = useCallback(async () => {
    try {
      const list = await window.electronAPI.conductordGetSessions()
      const mapped: ConductorSession[] = list
        .filter((s: { dead: boolean; id: string }) => !s.dead && !s.id.startsWith('__'))
        .map((s: { id: string; cwd: string; command: string }) => ({
          name: s.id,
          connected: true,
          command: s.command,
          cwd: s.cwd,
        }))
      mapped.sort((a, b) => a.name.localeCompare(b.name))
      setSessions(mapped)

      const liveNames = new Set(mapped.map(s => s.name))

      // Prune folder references to dead sessions
      const projectState = useProjectStore.getState()
      for (const folder of projectState.sessionFolders) {
        for (const sid of folder.sessionIds) {
          if (!liveNames.has(sid)) {
            projectState.removeSessionFromAllFolders(sid)
          }
        }
      }

      // Mark orphaned work sessions as completed
      const wsStore = useWorkSessionsStore.getState()
      for (const ws of wsStore.sessions) {
        if (ws.status === 'active' && ws.sessionId && !liveNames.has(ws.sessionId)) {
          wsStore.completeSession(ws.id)
        }
      }
    } catch {
      setSessions([])
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [refresh, intervalMs])

  const openTabIds = new Set<string>()
  for (const group of Object.values(groups)) {
    for (const tab of group.tabs) {
      openTabIds.add(tab.id)
    }
  }

  const wsMap = new Map<string, WorkSession>()
  for (const ws of workSessions) {
    if (ws.sessionId) wsMap.set(ws.sessionId, ws)
  }

  const enriched: EnrichedSession[] = sessions.map(s => ({
    session: s,
    workSession: wsMap.get(s.name) ?? null,
    ticketKey: ticketKeyFromSessionName(s.name),
    hasOpenTab: openTabIds.has(s.name),
  }))

  return { enriched, refresh }
}

// ── Tile helper ───────────────────────────────────────

export function tileSessions(sessions: EnrichedSession[], mode: TileMode = 'grid') {
  if (sessions.length === 0) return

  const tabsStore = useTabsStore.getState()
  const layoutStore = useLayoutStore.getState()
  const currentRoot = layoutStore.root
  if (!currentRoot) return

  const newGroupIds: string[] = []
  for (const s of sessions) {
    for (const [gid, group] of Object.entries(tabsStore.groups)) {
      if (group.tabs.find(t => t.id === s.session.name)) {
        const newGid = tabsStore.createGroup()
        tabsStore.moveTab(gid, s.session.name, newGid)
        newGroupIds.push(newGid)
        break
      }
    }
  }
  if (newGroupIds.length === 0) return

  const tileTree = buildTileLayout(newGroupIds, mode)
  layoutStore.setRoot({
    type: 'row',
    children: [
      { node: tileTree, size: 1 },
      { node: currentRoot, size: 1 },
    ],
  })
  layoutStore.setFocusedGroup(newGroupIds[0])
}

// ── Session row (file-tree style) ─────────────────────

function SessionTreeNode({
  session,
  depth,
  isSelected,
  selectedIds,
  onRowClick,
  onDragStateChange,
  onKillSelected,
  onRefresh,
  filter,
  allFolders,
  sessionMap,
}: {
  session: EnrichedSession
  depth: number
  isSelected: boolean
  selectedIds: Set<string>
  onRowClick: (name: string, e: React.MouseEvent) => void
  onDragStateChange: (dragging: boolean) => void
  onKillSelected: () => void
  onRefresh: () => void
  filter: string
  allFolders: SessionFolder[]
  sessionMap: Map<string, EnrichedSession>
}) {
  const focusedGroupId = useLayoutStore(s => s.focusedGroupId)
  const groups = useTabsStore(s => s.groups)
  const claudeAccounts = useConfigStore(s => s.config.claudeAccounts)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const infoProviders = useSessionInfoRegistry(s => s.providers)

  const indent = depth * 12

  const openTab = (() => {
    for (const [gid, group] of Object.entries(groups)) {
      const tab = group.tabs.find(t => t.id === session.session.name)
      if (tab) return { tab, groupId: gid }
    }
    return null
  })()

  const label = (openTab?.tab.title) || sessionLabel(session.session)
  const isThinking = openTab?.tab.isThinking ?? false
  const thinkingTime = openTab?.tab.thinkingTime
  const Icon = sessionIcon(session.session)
  const iconColor = sessionIconColor(session.session)

  // Filter check
  if (filter && !label.toLowerCase().includes(filter.toLowerCase()) && !session.session.name.toLowerCase().includes(filter.toLowerCase())) {
    return null
  }

  function startRename() {
    setRenameValue(label)
    setIsRenaming(true)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  function commitRename() {
    if (renameValue.trim()) {
      const title = renameValue.trim()
      setSessionTitle(session.session.name, title)
      if (openTab) {
        useTabsStore.getState().updateTab(openTab.groupId, openTab.tab.id, { title })
      }
    }
    setIsRenaming(false)
  }

  const openInTab = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const layoutGroupIds = new Set(useLayoutStore.getState().getAllGroupIds())

    if (openTab) {
      if (layoutGroupIds.has(openTab.groupId)) {
        useTabsStore.getState().setActiveTab(openTab.groupId, openTab.tab.id)
        useLayoutStore.getState().setFocusedGroup(openTab.groupId)
        return
      }
      useTabsStore.getState().removeTab(openTab.groupId, openTab.tab.id)
    }

    const tabsState = useTabsStore.getState()
    const layoutStore = useLayoutStore.getState()
    const allGroups = tabsState.groups

    // Find the anchor panel — the focused group, or the first visible group
    const anchorGroup = focusedGroupId && allGroups[focusedGroupId] && layoutGroupIds.has(focusedGroupId)
      ? focusedGroupId
      : [...layoutGroupIds].find(gid => allGroups[gid]) || Object.keys(allGroups)[0]

    if (anchorGroup) {
      // Add tab after the currently active tab in the focused group
      tabsState.addTab(anchorGroup, {
        id: session.session.name,
        type: 'claude-code',
        title: label,
        filePath: session.workSession?.worktree?.path || session.session.cwd,
      }, { afterActiveTab: true })
      layoutStore.setFocusedGroup(anchorGroup)
    } else {
      // No panels exist yet — create the first one
      const newGroupId = tabsState.createGroup()
      tabsState.addTab(newGroupId, {
        id: session.session.name,
        type: 'claude-code',
        title: label,
        filePath: session.workSession?.worktree?.path || session.session.cwd,
      })
    }
  }

  async function killSession() {
    await window.electronAPI.killTerminal(session.session.name)
    clearSessionTitle(session.session.name)
    if (session.workSession?.status === 'active') {
      await useWorkSessionsStore.getState().completeSession(session.workSession.id)
    }
    useProjectStore.getState().removeSessionFromAllFolders(session.session.name)
    if (openTab) {
      useTabsStore.getState().removeTab(openTab.groupId, openTab.tab.id)
    }
    setTimeout(onRefresh, 500)
  }

  const copyToClipboard = (text: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
  }

  // Build "Move to folder" submenu items
  const moveToFolderItems = [
    { id: null as string | null, label: 'Root' },
    ...allFolders.map(f => ({ id: f.id as string | null, label: f.name })),
  ]

  return (
    <div className="min-w-0">
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            draggable
            onClick={e => onRowClick(session.session.name, e)}
            onDoubleClick={() => openInTab()}
            onDragStart={e => {
              const names = isSelected && selectedIds.size > 1
                ? [...selectedIds]
                : [session.session.name]
              e.dataTransfer.setData('__dragging_session__', session.session.name)
              e.dataTransfer.setData('__dragging_sessions__', JSON.stringify(names))
              e.dataTransfer.effectAllowed = 'move'
              const ghost = document.createElement('div')
              ghost.textContent = names.length > 1 ? `${names.length} sessions` : label
              ghost.style.cssText = 'position:fixed;top:-1000px;padding:4px 10px;border-radius:6px;background:#27272a;color:#e4e4e7;font-size:var(--ui-text-xs);font-weight:500;white-space:nowrap;border:1px solid #3f3f46;box-shadow:0 4px 12px rgba(0,0,0,0.4);'
              document.body.appendChild(ghost)
              e.dataTransfer.setDragImage(ghost, 0, 0)
              setTimeout(() => document.body.removeChild(ghost), 0)
              setIsDragging(true)
              onDragStateChange(true)
            }}
            onDragEnd={() => {
              setIsDragging(false)
              onDragStateChange(false)
            }}
            className={cn(
              'flex items-center gap-1 px-2 py-[3px] cursor-pointer select-none transition-colors group',
              'text-ui-base',
              isDragging
                ? 'opacity-30'
                : isSelected
                  ? 'bg-indigo-900/30 text-zinc-100'
                  : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100'
            )}
            style={{ paddingLeft: `${8 + indent}px` }}
          >
            {/* Spacer to align with folder chevrons */}
            <span className="w-3 h-3 shrink-0" />

            {/* Session type icon */}
            <Icon className={cn('w-3.5 h-3.5 shrink-0', iconColor)} />

            {/* Label */}
            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="flex-1 bg-zinc-700 text-zinc-100 px-1 text-ui-base outline-none border border-blue-500"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setIsRenaming(false)
                  e.stopPropagation()
                }}
                onBlur={commitRename}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className={cn('truncate flex-1', isThinking && 'text-shimmer')}>
                {label}
                {isThinking && (
                  <span className="text-ui-xs ml-1.5 text-zinc-500">{thinkingTime || 'thinking'}</span>
                )}
              </span>
            )}

            {/* Kill button (hover only) */}
            <button
              onClick={e => { e.stopPropagation(); killSession() }}
              className="shrink-0 text-zinc-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              title="Kill session"
            >
              <Square className="w-3 h-3" />
            </button>

            {/* Info toggle (hover only) */}
            <button
              onClick={e => { e.stopPropagation(); setIsExpanded(!isExpanded) }}
              className={cn(
                'shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors',
                isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              )}
            >
              <Info className="w-3 h-3" />
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44 bg-zinc-900 border-zinc-700">
          {/* Terminal preview: opens a sub-panel showing the last few lines of output */}
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2 text-xs cursor-pointer">
              <Eye className="w-3.5 h-3.5" />
              Preview
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="bg-zinc-900 border-zinc-700 w-[340px]">
              <TerminalPreview sessionId={session.session.name} />
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator className="bg-zinc-700" />
          <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={startRename}>
            <Pencil className="w-3.5 h-3.5" />
            Rename
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2 text-xs cursor-pointer">
              <Folder className="w-3.5 h-3.5" />
              Move to…
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="bg-zinc-900 border-zinc-700">
              {moveToFolderItems.map(item => (
                <ContextMenuItem
                  key={item.id ?? '__root__'}
                  className="gap-2 text-xs cursor-pointer"
                  onSelect={() => {
                    const ids = isSelected && selectedIds.size > 1 ? [...selectedIds] : [session.session.name]
                    useProjectStore.getState().moveSessionsToFolder(ids, item.id)
                  }}
                >
                  {item.id ? <Folder className="w-3.5 h-3.5 text-yellow-500" /> : <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />}
                  {item.label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          {/* Tile selected sessions — only when 2+ selected sessions have open tabs */}
          {(() => {
            if (!(isSelected && selectedIds.size > 1)) return null
            const tileTargets = [...selectedIds]
              .map(id => sessionMap.get(id))
              .filter((s): s is EnrichedSession => s != null && s.hasOpenTab)
            if (tileTargets.length < 2) return null
            return (
              <ContextMenuSub>
                <ContextMenuSubTrigger className="gap-2 text-xs cursor-pointer">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Tile {tileTargets.length} sessions
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="bg-zinc-900 border-zinc-700">
                  <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={() => tileSessions(tileTargets, 'columns')}>
                    <Columns3 className="w-3.5 h-3.5" />
                    Columns
                  </ContextMenuItem>
                  <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={() => tileSessions(tileTargets, 'rows')}>
                    <Rows3 className="w-3.5 h-3.5" />
                    Rows
                  </ContextMenuItem>
                  <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={() => tileSessions(tileTargets, 'grid')}>
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Grid
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            )
          })()}
          <ContextMenuSeparator className="bg-zinc-700" />
          {isSelected && selectedIds.size > 1 ? (
            <ContextMenuItem className="gap-2 text-xs cursor-pointer text-red-400 focus:text-red-300" onSelect={onKillSelected}>
              <Square className="w-3.5 h-3.5" />
              Kill {selectedIds.size} sessions
            </ContextMenuItem>
          ) : (
            <ContextMenuItem className="gap-2 text-xs cursor-pointer text-red-400 focus:text-red-300" onSelect={killSession}>
              <Square className="w-3.5 h-3.5" />
              Kill session
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Expanded details panel */}
      {isExpanded && (
        <div className="pr-2 overflow-hidden" style={{ paddingLeft: `${8 + indent + 16}px` }}>
        <div
          className="py-1.5 px-2.5 rounded-md bg-zinc-800/60 border border-zinc-700/40 text-ui-xs mb-0.5 min-w-0"
        >
          <div className="space-y-1">
            {/* Directory */}
            <div className="group/row flex items-center gap-1.5">
              <Folder className="w-3 h-3 text-zinc-500 shrink-0" />
              <span className="text-zinc-300 truncate flex-1">{session.session.cwd}</span>
              <button onClick={e => copyToClipboard(session.session.cwd, e)} className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover/row:opacity-100">
                <Copy className="w-2.5 h-2.5" />
              </button>
            </div>

            {/* Branch */}
            {session.workSession?.worktree?.branch && (
              <div className="group/row flex items-center gap-1.5">
                <GitBranch className="w-3 h-3 text-zinc-500 shrink-0" />
                <span className="text-zinc-300 truncate flex-1">{session.workSession.worktree.branch}</span>
                <span className="text-zinc-600 shrink-0">from {session.workSession.worktree.baseBranch}</span>
              </div>
            )}

            {/* Session name */}
            <div className="group/row flex items-center gap-1.5">
              <Terminal className="w-3 h-3 text-zinc-500 shrink-0" />
              <span className="text-zinc-400 truncate flex-1 font-mono">{session.session.name}</span>
              <button onClick={e => copyToClipboard(session.session.name, e)} className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover/row:opacity-100">
                <Copy className="w-2.5 h-2.5" />
              </button>
            </div>

            {/* Claude session ID */}
            {session.workSession?.claudeSessionId && (
              <div className="group/row flex items-center gap-1.5">
                <Bot className="w-3 h-3 text-zinc-500 shrink-0" />
                <span className="text-zinc-400 truncate flex-1 font-mono">{session.workSession.claudeSessionId}</span>
                <button onClick={e => copyToClipboard(session.workSession!.claudeSessionId!, e)} className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover/row:opacity-100">
                  <Copy className="w-2.5 h-2.5" />
                </button>
              </div>
            )}

            {/* Ticket key */}
            {session.workSession?.ticketKey && (
              <div className="flex items-center gap-1.5">
                <Hash className="w-3 h-3 text-zinc-500 shrink-0" />
                <span className="text-zinc-300">{session.workSession.ticketKey}</span>
              </div>
            )}

            {/* Autopilot */}
            {openTab?.tab.autoPilot && (
              <div className="flex items-center gap-1.5">
                <Bot className="w-3 h-3 text-red-400 shrink-0" />
                <span className="text-red-400 font-medium">Autopilot</span>
              </div>
            )}

            {/* API Key */}
            {openTab?.tab.apiKey && (() => {
              const account = claudeAccounts.find(a => a.apiKey === openTab.tab.apiKey)
              if (!account) return null
              return (
                <div className="flex items-center gap-1.5">
                  <Key className="w-3 h-3 text-zinc-500 shrink-0" />
                  <span className="text-zinc-400">API Key: <span className="text-zinc-300">{account.name}</span></span>
                </div>
              )
            })()}

            {/* Extension-provided rows */}
            {infoProviders.map(p => {
              const ctx: SessionInfoContext = {
                sessionName: session.session.name,
                cwd: session.session.cwd,
                command: session.session.command,
                connected: session.session.connected,
                hasOpenTab: session.hasOpenTab,
                isThinking,
                workSession: session.workSession,
              }
              const node = p.render(ctx)
              return node ? <React.Fragment key={p.id}>{node}</React.Fragment> : null
            })}
          </div>
        </div>
        </div>
      )}
    </div>
  )
}

// ── Folder node (file-tree style) ─────────────────────

function FolderTreeNode({
  folder,
  depth,
  allFolders,
  sessionMap,
  selectedIds,
  onRowClick,
  onDragStateChange,
  onKillSelected,
  isDraggingActive,
  filter,
  onRefresh,
}: {
  folder: SessionFolder
  depth: number
  allFolders: SessionFolder[]
  sessionMap: Map<string, EnrichedSession>
  selectedIds: Set<string>
  onRowClick: (name: string, e: React.MouseEvent) => void
  onDragStateChange: (dragging: boolean) => void
  onKillSelected: () => void
  isDraggingActive: boolean
  filter: string
  onRefresh: () => void
}) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const expanded = !folder.collapsed
  const indent = depth * 12

  const childFolders = allFolders.filter(f => f.parentId === folder.id)
  const childSessions = folder.sessionIds
    .map(sid => sessionMap.get(sid))
    .filter((s): s is EnrichedSession => s != null)

  // For filter: check if any child matches
  const hasMatchingChildren = filter
    ? childSessions.some(s => {
        const lbl = sessionLabel(s.session)
        return lbl.toLowerCase().includes(filter.toLowerCase()) || s.session.name.toLowerCase().includes(filter.toLowerCase())
      }) || childFolders.some(f => f.name.toLowerCase().includes(filter.toLowerCase()))
    : true

  const folderNameMatches = filter ? folder.name.toLowerCase().includes(filter.toLowerCase()) : true

  if (filter && !folderNameMatches && !hasMatchingChildren) return null

  const attachedInFolder = childSessions.filter(s => s.hasOpenTab)
  const canTile = attachedInFolder.length > 1

  function startRename() {
    setRenameValue(folder.name)
    setIsRenaming(true)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  function commitRename() {
    if (renameValue.trim()) {
      useProjectStore.getState().renameSessionFolder(folder.id, renameValue.trim())
    }
    setIsRenaming(false)
  }

  function handleToggle() {
    useProjectStore.getState().toggleFolderCollapsed(folder.id)
  }

  function handleDelete() {
    useProjectStore.getState().removeSessionFolder(folder.id)
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('__dragging_session__') && !e.dataTransfer.types.includes('__dragging_folder__')) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    // Handle folder drop
    const folderId = e.dataTransfer.getData('__dragging_folder__')
    if (folderId) {
      useProjectStore.getState().moveFolderToFolder(folderId, folder.id)
      return
    }

    // Handle session drop
    const multi = e.dataTransfer.getData('__dragging_sessions__')
    let names: string[] = []
    if (multi) {
      try { names = JSON.parse(multi) } catch {}
    }
    if (names.length === 0) {
      const single = e.dataTransfer.getData('__dragging_session__')
      if (single) names = [single]
    }
    if (names.length > 0) {
      useProjectStore.getState().moveSessionsToFolder(names, folder.id)
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            draggable
            onDragStart={e => {
              e.dataTransfer.setData('__dragging_folder__', folder.id)
              e.dataTransfer.effectAllowed = 'move'
              const ghost = document.createElement('div')
              ghost.textContent = folder.name
              ghost.style.cssText = 'position:fixed;top:-1000px;padding:4px 10px;border-radius:6px;background:#27272a;color:#e4e4e7;font-size:var(--ui-text-xs);font-weight:500;white-space:nowrap;border:1px solid #3f3f46;box-shadow:0 4px 12px rgba(0,0,0,0.4);'
              document.body.appendChild(ghost)
              e.dataTransfer.setDragImage(ghost, 0, 0)
              setTimeout(() => document.body.removeChild(ghost), 0)
            }}
            className={cn(
              'flex items-center gap-1 px-2 py-[3px] cursor-pointer select-none transition-colors',
              'text-ui-base',
              isDragOver
                ? 'bg-indigo-900/30 text-zinc-100'
                : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100'
            )}
            style={{ paddingLeft: `${8 + indent}px` }}
            onClick={handleToggle}
            onDoubleClick={e => { e.stopPropagation(); startRename() }}
          >
            {/* Chevron */}
            <span className="text-zinc-500 shrink-0">
              {expanded
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />
              }
            </span>

            {/* Folder icon */}
            {expanded
              ? <FolderOpen className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
              : <Folder className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
            }

            {/* Name */}
            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="flex-1 bg-zinc-700 text-zinc-100 px-1 text-ui-base outline-none border border-blue-500"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setIsRenaming(false)
                  e.stopPropagation()
                }}
                onBlur={commitRename}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="truncate flex-1">{folder.name}</span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44 bg-zinc-900 border-zinc-700">
          <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={() => {
            useProjectStore.getState().addSessionFolder('New Folder', folder.id)
          }}>
            <FolderPlus className="w-3.5 h-3.5" />
            New subfolder
          </ContextMenuItem>
          <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={startRename}>
            <Pencil className="w-3.5 h-3.5" />
            Rename
          </ContextMenuItem>
          {canTile && (
            <ContextMenuSub>
              <ContextMenuSubTrigger className="gap-2 text-xs cursor-pointer">
                <LayoutGrid className="w-3.5 h-3.5" />
                Tile sessions
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="bg-zinc-900 border-zinc-700">
                <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={() => tileSessions(attachedInFolder, 'columns')}>
                  <Columns3 className="w-3.5 h-3.5" />
                  Columns
                </ContextMenuItem>
                <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={() => tileSessions(attachedInFolder, 'rows')}>
                  <Rows3 className="w-3.5 h-3.5" />
                  Rows
                </ContextMenuItem>
                <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={() => tileSessions(attachedInFolder, 'grid')}>
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Grid
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          <ContextMenuSeparator className="bg-zinc-700" />
          <ContextMenuItem className="gap-2 text-xs cursor-pointer text-red-400 focus:text-red-300" onSelect={handleDelete}>
            <Trash2 className="w-3.5 h-3.5" />
            Delete folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Children */}
      {expanded && (
        <div>
          {childFolders.map(f => (
            <FolderTreeNode
              key={f.id}
              folder={f}
              depth={depth + 1}
              allFolders={allFolders}
              sessionMap={sessionMap}
              selectedIds={selectedIds}
              onRowClick={onRowClick}
              onDragStateChange={onDragStateChange}
              onKillSelected={onKillSelected}
              isDraggingActive={isDraggingActive}
              filter={filter}
              onRefresh={onRefresh}
            />
          ))}
          {childSessions.map(s => (
            <SessionTreeNode
              key={s.session.name}
              session={s}
              depth={depth + 1}
              isSelected={selectedIds.has(s.session.name)}
              selectedIds={selectedIds}
              onRowClick={onRowClick}
              onDragStateChange={onDragStateChange}
              onKillSelected={onKillSelected}
              onRefresh={onRefresh}
              filter={filter}
              allFolders={allFolders}
              sessionMap={sessionMap}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Default folder for unfoldered sessions ──────────────

function DefaultFolderNode({
  sessions,
  sessionMap,
  selectedIds,
  onRowClick,
  onDragStateChange,
  onKillSelected,
  isDraggingActive,
  filter,
  allFolders,
  onRefresh,
}: {
  sessions: EnrichedSession[]
  sessionMap: Map<string, EnrichedSession>
  selectedIds: Set<string>
  onRowClick: (name: string, e: React.MouseEvent) => void
  onDragStateChange: (dragging: boolean) => void
  onKillSelected: () => void
  isDraggingActive: boolean
  filter: string
  allFolders: SessionFolder[]
  onRefresh: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const hasMatchingChildren = filter
    ? sessions.some(s => {
        const lbl = sessionLabel(s.session)
        return lbl.toLowerCase().includes(filter.toLowerCase()) || s.session.name.toLowerCase().includes(filter.toLowerCase())
      })
    : true

  if (filter && sessions.length > 0 && !hasMatchingChildren) return null

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('__dragging_session__')) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const multi = e.dataTransfer.getData('__dragging_sessions__')
    let names: string[] = []
    if (multi) {
      try { names = JSON.parse(multi) } catch {}
    }
    if (names.length === 0) {
      const single = e.dataTransfer.getData('__dragging_session__')
      if (single) names = [single]
    }
    if (names.length > 0) {
      useProjectStore.getState().moveSessionsToFolder(names, null)
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-[3px] cursor-pointer select-none transition-colors',
          'text-ui-base',
          isDragOver
            ? 'bg-indigo-900/30 text-zinc-100'
            : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100'
        )}
        style={{ paddingLeft: '8px' }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-zinc-500 shrink-0">
          {collapsed
            ? <ChevronRight className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3" />
          }
        </span>
        {collapsed
          ? <Folder className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          : <FolderOpen className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        }
        <span className="truncate flex-1 text-zinc-500">Default</span>
      </div>

      {!collapsed && (
        <div>
          {sessions.map(s => (
            <SessionTreeNode
              key={s.session.name}
              session={s}
              depth={1}
              isSelected={selectedIds.has(s.session.name)}
              selectedIds={selectedIds}
              onRowClick={onRowClick}
              onDragStateChange={onDragStateChange}
              onKillSelected={onKillSelected}
              onRefresh={onRefresh}
              filter={filter}
              allFolders={allFolders}
              sessionMap={sessionMap}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────

export default function WorkSessionsSidebar({ groupId }: { groupId: string }): React.ReactElement {
  const { enriched, refresh } = useConductorSessions()
  const sessionFolders = useProjectStore(s => s.sessionFolders)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedRef = useRef<string | null>(null)
  const [isDraggingActive, setIsDraggingActive] = useState(false)
  const [filter, setFilter] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Build session lookup
  const sessionMap = new Map<string, EnrichedSession>()
  for (const s of enriched) {
    sessionMap.set(s.session.name, s)
  }

  // Determine which sessions are in folders
  const sessionInFolder = new Set<string>()
  for (const f of sessionFolders) {
    for (const sid of f.sessionIds) {
      sessionInFolder.add(sid)
    }
  }

  // Root-level sessions = not in any folder
  const rootSessions = enriched.filter(s => !sessionInFolder.has(s.session.name))

  // Root-level folders
  const rootFolders = sessionFolders.filter(f => f.parentId === null)

  // All session names for shift-click range
  const flatSessionOrder: string[] = []
  function collectOrder(folders: SessionFolder[], parentId: string | null) {
    for (const f of folders.filter(f => f.parentId === parentId)) {
      for (const sid of f.sessionIds) flatSessionOrder.push(sid)
      collectOrder(folders, f.id)
    }
  }
  collectOrder(sessionFolders, null)
  for (const s of rootSessions) flatSessionOrder.push(s.session.name)

  // Escape clears selection, Cmd+F opens search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSearch) {
          setShowSearch(false)
          setFilter('')
        } else if (selectedIds.size > 0) {
          setSelectedIds(new Set())
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedIds.size, showSearch])

  useEffect(() => {
    if (showSearch) setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [showSearch])

  const handleRowClick = useCallback((name: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(name)) next.delete(name)
        else next.add(name)
        return next
      })
      lastClickedRef.current = name
    } else if (e.shiftKey && lastClickedRef.current) {
      const lastIdx = flatSessionOrder.indexOf(lastClickedRef.current)
      const curIdx = flatSessionOrder.indexOf(name)
      if (lastIdx !== -1 && curIdx !== -1) {
        const start = Math.min(lastIdx, curIdx)
        const end = Math.max(lastIdx, curIdx)
        const rangeNames = flatSessionOrder.slice(start, end + 1)
        setSelectedIds(prev => {
          const next = new Set(prev)
          const removing = prev.has(name)
          for (const n of rangeNames) {
            if (removing) next.delete(n)
            else next.add(n)
          }
          return next
        })
      }
    } else {
      setSelectedIds(prev => prev.size === 1 && prev.has(name) ? new Set() : new Set([name]))
      lastClickedRef.current = name
    }
  }, [flatSessionOrder])

  async function killSelected() {
    const sessionsStore = useWorkSessionsStore.getState()

    for (const name of selectedIds) {
      await window.electronAPI.killTerminal(name)
      clearSessionTitle(name)

      const match = enriched.find(s => s.session.name === name)
      if (match?.workSession?.status === 'active') {
        await sessionsStore.completeSession(match.workSession.id)
      }

      useProjectStore.getState().removeSessionFromAllFolders(name)

      // Get fresh state each iteration since prior removals mutate the store
      const freshTabs = useTabsStore.getState()
      for (const [gid, group] of Object.entries(freshTabs.groups)) {
        if (group.tabs.some(t => t.id === name)) {
          freshTabs.removeTab(gid, name)
          // If the group is now empty and other groups exist, remove it from layout
          const updated = useTabsStore.getState().groups[gid]
          if (!updated || updated.tabs.length === 0) {
            const allGroupIds = useLayoutStore.getState().getAllGroupIds()
            if (allGroupIds.length > 1) {
              useLayoutStore.getState().removeGroup(gid)
              useTabsStore.getState().removeGroup(gid)
            }
          }
          break
        }
      }
    }

    setSelectedIds(new Set())
    setTimeout(refresh, 500)
  }

  // Handle drop on root area (move to root)
  function handleRootDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('__dragging_session__') && !e.dataTransfer.types.includes('__dragging_folder__')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleRootDrop(e: React.DragEvent) {
    e.preventDefault()

    const folderId = e.dataTransfer.getData('__dragging_folder__')
    if (folderId) {
      useProjectStore.getState().moveFolderToFolder(folderId, null)
      return
    }

    const multi = e.dataTransfer.getData('__dragging_sessions__')
    let names: string[] = []
    if (multi) {
      try { names = JSON.parse(multi) } catch {}
    }
    if (names.length === 0) {
      const single = e.dataTransfer.getData('__dragging_session__')
      if (single) names = [single]
    }
    if (names.length > 0) {
      useProjectStore.getState().moveSessionsToFolder(names, null)
    }
  }

  return (
    <SidebarLayout
      title="Sessions"
      actions={[
        {
          icon: Search,
          label: 'Search',
          onClick: () => { setShowSearch(!showSearch); if (showSearch) setFilter('') },
        },
      ]}
    >
      {/* Search bar */}
      {showSearch && (
        <div className="px-2 py-1.5 border-b border-zinc-700/50">
          <input
            ref={searchInputRef}
            className="w-full bg-zinc-800 text-zinc-200 text-ui-base px-2 py-1 rounded border border-zinc-700 outline-none focus:border-blue-500 placeholder:text-zinc-600"
            placeholder="Filter sessions…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setShowSearch(false); setFilter('') }
            }}
          />
        </div>
      )}

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <ScrollArea className="flex-1 h-full">
            <div
              className="py-1 w-full overflow-x-hidden"
              onDragOver={handleRootDragOver}
              onDrop={handleRootDrop}
            >
              {/* Folders at root */}
              {rootFolders.map(f => (
                <FolderTreeNode
                  key={f.id}
                  folder={f}
                  depth={0}
                  allFolders={sessionFolders}
                  sessionMap={sessionMap}
                  selectedIds={selectedIds}
                  onRowClick={handleRowClick}
                  onDragStateChange={setIsDraggingActive}
                  onKillSelected={killSelected}
                  isDraggingActive={isDraggingActive}
                  filter={filter}
                  onRefresh={refresh}
                />
              ))}

              {/* Default folder for unfolder'd sessions — always shown */}
              <DefaultFolderNode
                sessions={rootSessions}
                sessionMap={sessionMap}
                selectedIds={selectedIds}
                onRowClick={handleRowClick}
                onDragStateChange={setIsDraggingActive}
                onKillSelected={killSelected}
                isDraggingActive={isDraggingActive}
                filter={filter}
                allFolders={sessionFolders}
                onRefresh={refresh}
              />
            </div>
          </ScrollArea>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44 bg-zinc-900 border-zinc-700">
          <ContextMenuItem className="gap-2 text-xs cursor-pointer" onSelect={() => {
            useProjectStore.getState().addSessionFolder('New Folder', null)
          }}>
            <FolderPlus className="w-3.5 h-3.5" />
            New folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

    </SidebarLayout>
  )
}
