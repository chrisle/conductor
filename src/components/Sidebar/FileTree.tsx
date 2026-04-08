import React, { useEffect, useRef, useState } from 'react'
import { FilePlus, FolderPlus, Bot, Terminal } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import FileTreeNode from './FileTreeNode'
import { useSidebarStore, type FileEntry } from '@/store/sidebar'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { nextSessionId } from '@/lib/session-id'
import { resolveTerminalCwd, saveTerminalCwd } from '@/lib/terminal-cwd'

interface FileTreeProps {
  groupId: string
}

type CreatingType = 'file' | 'folder' | null

export default function FileTree({ groupId }: FileTreeProps): React.ReactElement {
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [creating, setCreating] = useState<CreatingType>(null)
  const [newName, setNewName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const rootPath = useSidebarStore(s => s.rootPath)
  const setRootPath = useSidebarStore(s => s.setRootPath)
  const focusedGroupId = useLayoutStore(s => s.focusedGroupId)

  function openClaudeHere() {
    const cwd = rootPath || '/'
    const layoutGroupIds = useLayoutStore.getState().getAllGroupIds()
    const targetGroupId = (focusedGroupId && layoutGroupIds.includes(focusedGroupId))
      ? focusedGroupId
      : groupId
    const id = nextSessionId('claude-code')
    useTabsStore.getState().addTab(targetGroupId, {
      id,
      type: 'claude-code',
      title: id,
      filePath: cwd,
      initialCommand: 'claude\n',
    })
  }

  function openTerminalHere() {
    const cwd = rootPath || resolveTerminalCwd()
    saveTerminalCwd(cwd)
    const layoutGroupIds = useLayoutStore.getState().getAllGroupIds()
    const targetGroupId = (focusedGroupId && layoutGroupIds.includes(focusedGroupId))
      ? focusedGroupId
      : groupId
    useTabsStore.getState().addTab(targetGroupId, { type: 'terminal', title: 'Terminal', filePath: cwd })
  }

  useEffect(() => {
    async function init() {
      if (!rootPath) {
        const home = await window.electronAPI.getHomeDir()
        setRootPath(home)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (rootPath) loadRoot()
  }, [rootPath])

  useEffect(() => {
    const handleRefresh = () => { if (rootPath) loadRoot() }
    window.addEventListener('sidebar:refresh', handleRefresh)
    return () => window.removeEventListener('sidebar:refresh', handleRefresh)
  }, [rootPath])

  useEffect(() => {
    if (!rootPath) return
    const id = setInterval(async () => {
      const entries = await window.electronAPI.readDir(rootPath)
      setRootEntries(entries)
    }, 2000)
    return () => clearInterval(id)
  }, [rootPath])

  useEffect(() => {
    const handleNew = (e: Event) => {
      const type = (e as CustomEvent).detail.type as CreatingType
      setCreating(type)
      setNewName('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
    window.addEventListener('sidebar:new', handleNew)
    return () => window.removeEventListener('sidebar:new', handleNew)
  }, [])

  useEffect(() => {
    if (creating) setTimeout(() => inputRef.current?.focus(), 0)
  }, [creating])

  async function loadRoot() {
    if (!rootPath) return
    setIsLoading(true)
    const entries = await window.electronAPI.readDir(rootPath)
    setRootEntries(entries)
    setIsLoading(false)
  }

  async function commitNew() {
    if (!newName.trim() || !rootPath || !creating) {
      setCreating(null)
      return
    }
    const target = `${rootPath}/${newName.trim()}`
    if (creating === 'folder') {
      await window.electronAPI.mkdir(target)
    } else {
      await window.electronAPI.writeFile(target, '')
    }
    setCreating(null)
    setNewName('')
    await loadRoot()
  }

  if (isLoading) {
    return (
      <div className="py-1 px-2 space-y-1">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-1.5 py-[3px]" style={{ paddingLeft: `${(i % 3) * 12}px` }}>
            <Skeleton className="h-3 w-3 rounded-sm shrink-0" />
            <Skeleton className="h-3.5 w-3.5 rounded-sm shrink-0" />
            <Skeleton className="h-3" style={{ width: `${50 + ((i * 23) % 40)}%` }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <ContextMenu>
    <ContextMenuTrigger asChild>
    <ScrollArea className="flex-1 h-full">
      <div className="py-1">
        {rootPath && rootPath !== '/' && (
          <div
            className="flex items-center gap-1 px-2 py-0.5 cursor-pointer select-none text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors  text-ui-base"
            onDoubleClick={() => {
              const parent = rootPath.substring(0, rootPath.lastIndexOf('/')) || '/'
              setRootPath(parent)
            }}
          >
            <span className="w-3 h-3 shrink-0" />
            <span>..</span>
          </div>
        )}

        {creating && (
          <div className="flex items-center gap-1 px-2 py-0.5  text-ui-base">
            <span className="w-3 h-3 shrink-0" />
            <span className="text-zinc-500">{creating === 'folder' ? '📁' : '📄'}</span>
            <input
              ref={inputRef}
              className="flex-1 bg-zinc-700 text-zinc-100 px-1 text-ui-base  outline-none border border-blue-500"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitNew()
                if (e.key === 'Escape') setCreating(null)
              }}
              onBlur={commitNew}
              placeholder={creating === 'folder' ? 'folder name' : 'file name'}
            />
          </div>
        )}

        {rootEntries.map(entry => (
          <FileTreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            groupId={groupId}
          />
        ))}
      </div>
    </ScrollArea>
    </ContextMenuTrigger>
    <ContextMenuContent className="bg-zinc-900 border-zinc-700 min-w-[140px]">
      <ContextMenuItem
        className="gap-2 text-xs cursor-pointer"
        onClick={() => { setCreating('file'); setNewName('') }}
      >
        <FilePlus className="w-3.5 h-3.5" />
        New File
      </ContextMenuItem>
      <ContextMenuItem
        className="gap-2 text-xs cursor-pointer"
        onClick={() => { setCreating('folder'); setNewName('') }}
      >
        <FolderPlus className="w-3.5 h-3.5" />
        New Folder
      </ContextMenuItem>
      <ContextMenuSeparator className="bg-zinc-700" />
      <ContextMenuItem
        className="gap-2 text-xs cursor-pointer"
        onClick={openClaudeHere}
      >
        <Bot className="w-3.5 h-3.5" />
        Open Claude here
      </ContextMenuItem>
      <ContextMenuItem
        className="gap-2 text-xs cursor-pointer"
        onClick={openTerminalHere}
      >
        <Terminal className="w-3.5 h-3.5" />
        Open Terminal here
      </ContextMenuItem>
    </ContextMenuContent>
    </ContextMenu>
  )
}
