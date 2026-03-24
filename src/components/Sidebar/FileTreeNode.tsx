import React, { useState, useEffect } from 'react'
import {
  ChevronRight, ChevronDown, Folder, FolderOpen,
  FileCode, FileJson, FileText, FileImage, FileArchive,
  Terminal, Settings, Globe, Palette, Package, Database,
  Film, Music, File, Lock, GitBranch
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { useSidebarStore, type FileEntry } from '@/store/sidebar'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'

interface FileTreeNodeProps {
  entry: FileEntry
  depth: number
  groupId: string
}

function getFileIcon(filename: string): LucideIcon {
  const lower = filename.toLowerCase()
  const ext = lower.split('.').pop() || ''

  if (lower === 'package.json' || lower === 'package-lock.json') return Package
  if (lower === '.gitignore' || lower === '.gitattributes') return GitBranch
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'java',
       'c', 'cpp', 'cs', 'php', 'rb', 'swift', 'kt', 'vue', 'svelte'].includes(ext)) return FileCode
  if (['json', 'jsonc', 'yaml', 'yml', 'toml', 'xml'].includes(ext)) return FileJson
  if (['md', 'mdx', 'txt', 'rst'].includes(ext)) return FileText
  if (['html', 'astro'].includes(ext)) return Globe
  if (['css', 'scss', 'sass', 'less'].includes(ext)) return Palette
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff'].includes(ext)) return FileImage
  if (['svg'].includes(ext)) return FileImage
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return Film
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return Music
  if (['zip', 'tar', 'gz', 'bz2', 'rar', '7z'].includes(ext)) return FileArchive
  if (['sh', 'bash', 'zsh', 'fish', 'ps1'].includes(ext)) return Terminal
  if (['sql', 'db', 'sqlite'].includes(ext)) return Database
  if (['lock'].includes(ext) || lower.endsWith('.lock')) return Lock
  if (['env', 'env.local', 'env.example', 'env.development', 'env.production'].some(e => lower === e || lower === `.${e}`)) return Settings
  if (['config', 'rc', 'editorconfig'].some(e => lower.endsWith(`.${e}`) || lower.endsWith(`rc`))) return Settings
  return File
}

function getFileColor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['ts', 'tsx'].includes(ext)) return 'text-blue-400'
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'text-yellow-400'
  if (['json', 'jsonc'].includes(ext)) return 'text-yellow-300'
  if (['css', 'scss', 'less'].includes(ext)) return 'text-pink-400'
  if (['html', 'vue', 'svelte', 'astro'].includes(ext)) return 'text-orange-400'
  if (['py'].includes(ext)) return 'text-green-400'
  if (['rs'].includes(ext)) return 'text-orange-500'
  if (['go'].includes(ext)) return 'text-cyan-400'
  if (['md', 'mdx'].includes(ext)) return 'text-zinc-300'
  if (['sh', 'bash', 'zsh'].includes(ext)) return 'text-green-500'
  if (['env', 'env.local', 'env.example'].includes(filename.replace(/^\./, '')) || ext === 'env') return 'text-red-400'
  if (['lock'].includes(ext) || filename.endsWith('.lock')) return 'text-zinc-600'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return 'text-purple-400'
  return 'text-zinc-400'
}

function getLanguageFromExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
    cs: 'csharp', php: 'php', rb: 'ruby', swift: 'swift', kt: 'kotlin',
    html: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', sh: 'shell', bash: 'shell', zsh: 'shell',
    sql: 'sql', graphql: 'graphql', gql: 'graphql',
    vue: 'html', svelte: 'html', astro: 'html',
    dockerfile: 'dockerfile', Dockerfile: 'dockerfile'
  }
  return map[ext] || 'plaintext'
}

export default function FileTreeNode({ entry, depth, groupId }: FileTreeNodeProps): React.ReactElement {
  const [children, setChildren] = useState<FileEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(entry.name)

  const { isExpanded, toggleExpanded } = useSidebarStore()
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()

  const expanded = isExpanded(entry.path)

  useEffect(() => {
    if (expanded && entry.isDirectory && children.length === 0) {
      loadChildren()
    }
  }, [expanded])

  async function loadChildren() {
    setIsLoading(true)
    const result = await window.electronAPI.readDir(entry.path)
    setChildren(result)
    setIsLoading(false)
  }

  async function refreshChildren() {
    if (expanded && entry.isDirectory) {
      setIsLoading(true)
      const result = await window.electronAPI.readDir(entry.path)
      setChildren(result)
      setIsLoading(false)
    }
  }

  function handleClick() {
    if (entry.isDirectory) {
      toggleExpanded(entry.path)
      if (!expanded && children.length === 0) loadChildren()
    } else {
      openFile()
    }
  }

  function handleDoubleClick() {
    if (entry.isDirectory) {
      useSidebarStore.getState().setRootPath(entry.path)
    }
  }

  function openFile() {
    const targetGroupId = focusedGroupId || groupId
    addTab(targetGroupId, {
      type: 'text',
      title: entry.name,
      filePath: entry.path
    })
  }

  async function handleDelete() {
    await window.electronAPI.deleteFile(entry.path)
    // Parent will need to refresh - we'll trigger via custom event
    window.dispatchEvent(new CustomEvent('sidebar:refresh', { detail: { path: entry.path } }))
  }

  async function handleRename() {
    if (!isRenaming) {
      setIsRenaming(true)
      setRenameValue(entry.name)
      return
    }
    if (renameValue && renameValue !== entry.name) {
      const dir = entry.path.substring(0, entry.path.lastIndexOf('/'))
      const newPath = `${dir}/${renameValue}`
      await window.electronAPI.rename(entry.path, newPath)
      window.dispatchEvent(new CustomEvent('sidebar:refresh', { detail: { path: entry.path } }))
    }
    setIsRenaming(false)
  }

  const indent = depth * 12

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              'flex items-center gap-1 px-2 py-[3px] cursor-pointer select-none text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors group',
              'font-mono text-xs'
            )}
            style={{ paddingLeft: `${8 + indent}px` }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
          >
            {entry.isDirectory ? (
              <>
                <span className="text-zinc-600 shrink-0">
                  {expanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </span>
                {expanded ? (
                  <FolderOpen className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                )}
              </>
            ) : (
              <>
                <span className="w-3 h-3 shrink-0" />
                {React.createElement(getFileIcon(entry.name), {
                  className: cn('w-3.5 h-3.5 shrink-0', getFileColor(entry.name))
                })}
              </>
            )}

            {isRenaming ? (
              <input
                className="flex-1 bg-zinc-700 text-zinc-100 px-1 text-xs font-mono outline-none border border-blue-500"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={handleRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') setIsRenaming(false)
                }}
                autoFocus
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className={cn('truncate', entry.isFile && getFileColor(entry.name))}>{entry.name}</span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {entry.isFile && (
            <ContextMenuItem onClick={openFile}>Open</ContextMenuItem>
          )}
          {entry.isDirectory && (
            <ContextMenuItem onClick={() => {
              const store = useSidebarStore.getState()
              if (store.isFavorite(entry.path)) {
                store.removeFavorite(entry.path)
              } else {
                store.addFavorite(entry.path)
              }
            }}>
              {useSidebarStore.getState().isFavorite(entry.path) ? 'Unfavorite' : 'Favorite'}
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => { setIsRenaming(true); setRenameValue(entry.name) }}>
            Rename
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-red-400 focus:text-red-400 focus:bg-red-950"
            onClick={handleDelete}
          >
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {expanded && entry.isDirectory && (
        <div>
          {isLoading && (
            <div
              className="text-zinc-600 text-xs font-mono py-[3px]"
              style={{ paddingLeft: `${8 + indent + 20}px` }}
            >
              Loading...
            </div>
          )}
          {children.map(child => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              groupId={groupId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
