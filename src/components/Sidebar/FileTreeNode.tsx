import React, { useState, useEffect, useRef } from 'react'
import {
  ChevronRight, ChevronDown, Folder, FolderOpen,
  FileCode, FileJson, FileText, FileImage, FileArchive,
  Terminal, Settings, Globe, Palette, Package, Database,
  Film, Music, File, Lock, GitBranch,
  FileUp, FilePlus, FolderPlus, Star, StarOff, Pencil, Trash2
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
import { Skeleton } from '@/components/ui/skeleton'
import { useSidebarStore, type FileEntry } from '@/store/sidebar'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { extensionRegistry } from '@/extensions'

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
  if (['md', 'mdx', 'txt', 'rst', 'docx', 'doc'].includes(ext)) return FileText
  if (['html', 'astro'].includes(ext)) return Globe
  if (['css', 'scss', 'sass', 'less'].includes(ext)) return Palette
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff'].includes(ext)) return FileImage
  if (['svg'].includes(ext)) return FileImage
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return Film
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return Music
  if (['xlsx', 'xls', 'csv'].includes(ext)) return FileJson
  if (['zip', 'tar', 'gz', 'bz2', 'rar', '7z'].includes(ext)) return FileArchive
  if (['sh', 'bash', 'zsh', 'fish', 'ps1'].includes(ext)) return Terminal
  if (['sql', 'db', 'sqlite'].includes(ext)) return Database
  if (['lock'].includes(ext) || lower.endsWith('.lock')) return Lock
  if (['env', 'env.local', 'env.example', 'env.development', 'env.production'].some(e => lower === e || lower === `.${e}`)) return Settings
  if (['config', 'rc', 'editorconfig'].some(e => lower.endsWith(`.${e}`) || lower.endsWith(`rc`))) return Settings
  return File
}

function getFileColor(filename: string): string {
  const lower = filename.toLowerCase()
  const ext = lower.split('.').pop() || ''

  // Special filenames
  if (lower === 'dockerfile' || lower === 'docker-compose.yml' || lower === 'docker-compose.yaml') return 'text-sky-400'
  if (lower === 'makefile' || lower === 'cmakelists.txt') return 'text-orange-400'
  if (lower === 'license' || lower === 'licence') return 'text-yellow-500'
  if (lower === 'readme.md' || lower === 'changelog.md') return 'text-blue-300'
  if (lower === '.gitignore' || lower === '.gitattributes' || lower === '.gitmodules') return 'text-orange-400'
  if (lower === '.editorconfig' || lower === '.prettierrc' || lower === '.eslintrc' || lower.startsWith('.eslintrc')) return 'text-zinc-400'

  // TypeScript — blue (VS Code Seti)
  if (['ts', 'tsx'].includes(ext)) return 'text-blue-400'
  // JavaScript — yellow (VS Code Seti)
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'text-yellow-400'
  // JSON — yellow-green
  if (['json', 'jsonc'].includes(ext)) return 'text-yellow-600'
  // CSS/SCSS/Less — purple/pink (VS Code Seti uses purple for CSS)
  if (['css'].includes(ext)) return 'text-blue-300'
  if (['scss', 'sass', 'less'].includes(ext)) return 'text-pink-400'
  // HTML — orange/red (VS Code Seti)
  if (['html', 'htm'].includes(ext)) return 'text-orange-500'
  // Vue — green
  if (['vue'].includes(ext)) return 'text-green-400'
  // Svelte — orange-red
  if (['svelte'].includes(ext)) return 'text-orange-500'
  // Astro — orange
  if (['astro'].includes(ext)) return 'text-orange-400'
  // Python — blue (VS Code Seti)
  if (['py', 'pyw', 'pyi'].includes(ext)) return 'text-blue-300'
  // Rust — orange (VS Code Seti)
  if (['rs'].includes(ext)) return 'text-orange-500'
  // Go — cyan (VS Code Seti)
  if (['go'].includes(ext)) return 'text-cyan-400'
  // Ruby — red
  if (['rb', 'erb'].includes(ext)) return 'text-red-400'
  // Java — orange
  if (['java'].includes(ext)) return 'text-orange-400'
  // C/C++ — blue
  if (['c', 'h'].includes(ext)) return 'text-blue-300'
  if (['cpp', 'cc', 'cxx', 'hpp', 'hxx'].includes(ext)) return 'text-blue-400'
  // C# — green
  if (['cs'].includes(ext)) return 'text-green-500'
  // PHP — purple
  if (['php'].includes(ext)) return 'text-purple-400'
  // Swift — orange
  if (['swift'].includes(ext)) return 'text-orange-400'
  // Kotlin — purple
  if (['kt', 'kts'].includes(ext)) return 'text-purple-400'
  // Markdown — blue (VS Code Seti)
  if (['md', 'mdx'].includes(ext)) return 'text-blue-300'
  // Text/docs
  if (['txt', 'rst'].includes(ext)) return 'text-zinc-300'
  if (['docx', 'doc'].includes(ext)) return 'text-blue-400'
  if (['xlsx', 'xls'].includes(ext)) return 'text-green-400'
  if (['csv'].includes(ext)) return 'text-green-500'
  // YAML/TOML — purple (VS Code Seti uses purple for YAML)
  if (['yaml', 'yml'].includes(ext)) return 'text-purple-300'
  if (['toml'].includes(ext)) return 'text-zinc-300'
  // XML — orange
  if (['xml', 'xsl', 'xslt'].includes(ext)) return 'text-orange-400'
  // Shell — green (VS Code Seti)
  if (['sh', 'bash', 'zsh', 'fish', 'ps1'].includes(ext)) return 'text-green-500'
  // SQL — yellow
  if (['sql'].includes(ext)) return 'text-yellow-400'
  // GraphQL — pink
  if (['graphql', 'gql'].includes(ext)) return 'text-pink-400'
  // Env files — yellow with warning feel
  if (['env', 'env.local', 'env.example'].includes(filename.replace(/^\./, '')) || ext === 'env') return 'text-yellow-600'
  // Lock files — dimmed
  if (['lock'].includes(ext) || filename.endsWith('.lock')) return 'text-zinc-600'
  // Images — purple (VS Code Seti)
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff'].includes(ext)) return 'text-purple-400'
  // Video — red-ish
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'text-red-400'
  // Audio — pink
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return 'text-pink-300'
  // Archives — yellow
  if (['zip', 'tar', 'gz', 'bz2', 'rar', '7z'].includes(ext)) return 'text-yellow-500'
  // Config files — gear grey
  if (['config', 'rc', 'ini', 'cfg'].includes(ext)) return 'text-zinc-400'
  // Database
  if (['db', 'sqlite'].includes(ext)) return 'text-yellow-400'

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

type CreatingType = 'file' | 'folder' | null

export default function FileTreeNode({ entry, depth, groupId }: FileTreeNodeProps): React.ReactElement {
  const [children, setChildren] = useState<FileEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(entry.name)
  const [creating, setCreating] = useState<CreatingType>(null)
  const [newName, setNewName] = useState('')
  const createInputRef = useRef<HTMLInputElement>(null)

  const { isExpanded, toggleExpanded } = useSidebarStore()
  const { addTab } = useTabsStore()
  const { focusedGroupId, setFocusedGroup } = useLayoutStore()

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
    const layoutGroupIds = useLayoutStore.getState().getAllGroupIds()
    // If the file is already open in a visible group, focus that tab
    for (const [gid, group] of Object.entries(useTabsStore.getState().groups)) {
      if (!layoutGroupIds.includes(gid)) continue
      const existing = group.tabs.find(t => t.filePath === entry.path)
      if (existing) {
        useTabsStore.getState().setActiveTab(gid, existing.id)
        setFocusedGroup(gid)
        return
      }
    }
    const targetGroupId = (focusedGroupId && layoutGroupIds.includes(focusedGroupId))
      ? focusedGroupId
      : groupId
    addTab(targetGroupId, {
      type: extensionRegistry.getTabTypeForFile(entry.name),
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

  function startCreating(type: CreatingType) {
    // Expand the directory first if it isn't already
    if (!expanded) {
      toggleExpanded(entry.path)
      if (children.length === 0) loadChildren()
    }
    setCreating(type)
    setNewName('')
    setTimeout(() => createInputRef.current?.focus(), 0)
  }

  async function commitNew() {
    if (!newName.trim() || !creating) {
      setCreating(null)
      return
    }
    const target = `${entry.path}/${newName.trim()}`
    if (creating === 'folder') {
      await window.electronAPI.mkdir(target)
    } else {
      await window.electronAPI.writeFile(target, '')
    }
    setCreating(null)
    setNewName('')
    await refreshChildren()
    // Also trigger a global refresh in case parent needs to update
    window.dispatchEvent(new CustomEvent('sidebar:refresh', { detail: { path: entry.path } }))
  }

  useEffect(() => {
    if (creating) setTimeout(() => createInputRef.current?.focus(), 0)
  }, [creating])

  const indent = depth * 12

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              'flex items-center gap-1 px-2 py-[3px] cursor-pointer select-none text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100 transition-colors group',
              'text-ui-base'
            )}
            style={{ paddingLeft: `${8 + indent}px` }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
          >
            {entry.isDirectory ? (
              <>
                <span className="text-zinc-500 shrink-0">
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
                className="flex-1 bg-zinc-700 text-zinc-100 px-1 text-ui-base outline-none border border-blue-500"
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
        <ContextMenuContent className="bg-zinc-900 border-zinc-700 min-w-[140px]">
          {entry.isFile && (
            <ContextMenuItem className="text-ui-base text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100" onClick={openFile}>
              <FileUp className="w-3.5 h-3.5 mr-2" />
              Open
            </ContextMenuItem>
          )}
          {entry.isDirectory && (
            <>
              <ContextMenuItem className="text-ui-base text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100" onClick={() => startCreating('file')}>
                <FilePlus className="w-3.5 h-3.5 mr-2" />
                New File
              </ContextMenuItem>
              <ContextMenuItem className="text-ui-base text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100" onClick={() => startCreating('folder')}>
                <FolderPlus className="w-3.5 h-3.5 mr-2" />
                New Folder
              </ContextMenuItem>
              <ContextMenuSeparator className="bg-zinc-700" />
              <ContextMenuItem className="text-ui-base text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100" onClick={() => {
                const store = useSidebarStore.getState()
                if (store.isFavorite(entry.path)) {
                  store.removeFavorite(entry.path)
                } else {
                  store.addFavorite(entry.path)
                }
              }}>
                {useSidebarStore.getState().isFavorite(entry.path) ? (
                  <><StarOff className="w-3.5 h-3.5 mr-2" />Unfavorite</>
                ) : (
                  <><Star className="w-3.5 h-3.5 mr-2" />Favorite</>
                )}
              </ContextMenuItem>
            </>
          )}
          <ContextMenuItem className="text-ui-base text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100" onClick={() => { setIsRenaming(true); setRenameValue(entry.name) }}>
            <Pencil className="w-3.5 h-3.5 mr-2" />
            Rename
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-zinc-700" />
          <ContextMenuItem
            className="text-ui-base text-red-400 focus:bg-zinc-800 focus:text-red-300"
            onClick={handleDelete}
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {expanded && entry.isDirectory && (
        <div>
          {creating && (
            <div
              className="flex items-center gap-1 px-2 py-[3px] text-ui-base"
              style={{ paddingLeft: `${8 + indent + 12}px` }}
            >
              <span className="w-3 h-3 shrink-0" />
              <span className="text-zinc-500 shrink-0">{creating === 'folder' ? <Folder className="w-3.5 h-3.5" /> : <File className="w-3.5 h-3.5" />}</span>
              <input
                ref={createInputRef}
                className="flex-1 bg-zinc-700 text-zinc-100 px-1 text-ui-base outline-none border border-blue-500"
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
          {isLoading && (
            <div className="space-y-0.5">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 py-[3px]"
                  style={{ paddingLeft: `${8 + indent + 12}px` }}
                >
                  <Skeleton className="h-3 w-3 rounded-sm shrink-0" />
                  <Skeleton className="h-3.5 w-3.5 rounded-sm shrink-0" />
                  <Skeleton className="h-3" style={{ width: `${40 + (i * 20)}%` }} />
                </div>
              ))}
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
