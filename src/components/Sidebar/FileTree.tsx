import React, { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import FileTreeNode from './FileTreeNode'
import { useSidebarStore, type FileEntry } from '@/store/sidebar'

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
  const { rootPath, setRootPath, gitRef, gitRepoRoot, virtualPath, setVirtualPath, exitVirtualMode } = useSidebarStore()

  useEffect(() => {
    async function init() {
      if (!rootPath && !gitRef) {
        const home = await window.electronAPI.getHomeDir()
        setRootPath(home)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (gitRef && gitRepoRoot) {
      loadVirtualRoot()
    } else if (rootPath) {
      loadRoot()
    }
  }, [rootPath, gitRef, gitRepoRoot, virtualPath])

  useEffect(() => {
    const handleRefresh = () => {
      if (gitRef && gitRepoRoot) loadVirtualRoot()
      else if (rootPath) loadRoot()
    }
    window.addEventListener('sidebar:refresh', handleRefresh)
    return () => window.removeEventListener('sidebar:refresh', handleRefresh)
  }, [rootPath, gitRef, gitRepoRoot, virtualPath])

  // Only poll in filesystem mode (virtual tree is immutable)
  useEffect(() => {
    if (gitRef || !rootPath) return
    const id = setInterval(async () => {
      const entries = await window.electronAPI.readDir(rootPath)
      setRootEntries(entries)
    }, 2000)
    return () => clearInterval(id)
  }, [rootPath, gitRef])

  // Poll git status for file decorations
  const { setGitStatusMap } = useSidebarStore()
  useEffect(() => {
    if (gitRef || !rootPath) return
    async function fetchGitStatus() {
      try {
        const entries = await window.electronAPI.gitStatus(rootPath!)
        const map = new Map<string, string>()
        for (const e of entries) {
          map.set(e.path, e.status)
        }
        setGitStatusMap(map)
      } catch {}
    }
    fetchGitStatus()
    const id = setInterval(fetchGitStatus, 3000)
    return () => clearInterval(id)
  }, [rootPath, gitRef])

  useEffect(() => {
    if (gitRef) return // No file creation in virtual mode
    const handleNew = (e: Event) => {
      const type = (e as CustomEvent).detail.type as CreatingType
      setCreating(type)
      setNewName('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
    window.addEventListener('sidebar:new', handleNew)
    return () => window.removeEventListener('sidebar:new', handleNew)
  }, [gitRef])

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

  async function loadVirtualRoot() {
    if (!gitRepoRoot || !gitRef) return
    setIsLoading(true)
    const entries = await window.electronAPI.gitLsTree(gitRepoRoot, gitRef, virtualPath)
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

  function handleParentNav() {
    if (gitRef) {
      // Navigate up in virtual tree
      if (virtualPath) {
        const parent = virtualPath.includes('/') ? virtualPath.substring(0, virtualPath.lastIndexOf('/')) : ''
        setVirtualPath(parent)
      } else {
        // At virtual root — exit virtual mode
        exitVirtualMode()
      }
    } else if (rootPath && rootPath !== '/') {
      const parent = rootPath.substring(0, rootPath.lastIndexOf('/')) || '/'
      setRootPath(parent)
    }
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

  const showParent = gitRef ? true : (rootPath && rootPath !== '/')

  return (
    <ScrollArea className="flex-1 h-full">
      <div className="py-1">
        {showParent && (
          <div
            className="flex items-center gap-1 px-2 py-0.5 cursor-pointer select-none text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors  text-ui-base"
            onDoubleClick={handleParentNav}
          >
            <span className="w-3 h-3 shrink-0" />
            <span>..</span>
          </div>
        )}

        {!gitRef && creating && (
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
            gitRef={gitRef}
            gitRepoRoot={gitRepoRoot}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
