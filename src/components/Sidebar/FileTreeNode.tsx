import React, { useState, useEffect, useRef } from 'react'
import {
  ChevronRight, ChevronDown, Folder, FolderOpen,
  FileCode, FileJson, FileText, FileImage, FileArchive,
  Terminal, Settings, Globe, Palette, Package, Database,
  Film, Music, File, Lock, GitBranch,
  FileUp, FilePlus, FolderPlus, Star, StarOff, Pencil, Trash2, Bot, Copy
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
import { nextSessionId } from '@/lib/session-id'
import { saveTerminalCwd } from '@/lib/terminal-cwd'

interface FileTreeNodeProps {
  entry: FileEntry
  depth: number
  groupId: string
  gitRef?: string | null
  gitRepoRoot?: string | null
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

function getIconColor(filename: string): string {
  const lower = filename.toLowerCase()
  const ext = lower.split('.').pop() || ''

  // Special filenames — matched to VS Code Seti icon theme
  if (lower === 'dockerfile' || lower === 'docker-compose.yml' || lower === 'docker-compose.yaml') return 'text-[#3A96DD]'
  if (lower === 'makefile' || lower === 'cmakelists.txt') return 'text-[#E8AB53]'
  if (lower === 'license' || lower === 'licence') return 'text-[#CBCB41]'
  if (lower === 'readme.md' || lower === 'changelog.md') return 'text-[#519ABA]'
  if (lower === '.gitignore' || lower === '.gitattributes' || lower === '.gitmodules') return 'text-[#41535B]'
  if (lower === '.editorconfig' || lower === '.prettierrc' || lower === '.eslintrc' || lower.startsWith('.eslintrc')) return 'text-[#4B32C3]'
  if (lower === 'package.json' || lower === 'package-lock.json') return 'text-[#E8274B]'

  // TypeScript — blue (VS Code Seti: #519ABA)
  if (['ts', 'tsx'].includes(ext)) return 'text-[#519ABA]'
  // JavaScript — yellow (VS Code Seti: #CBCB41)
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'text-[#CBCB41]'
  // JSON — yellow-green (VS Code Seti: #CBCB41)
  if (['json', 'jsonc'].includes(ext)) return 'text-[#CBCB41]'
  // CSS — blue (VS Code Seti: #519ABA)
  if (['css'].includes(ext)) return 'text-[#519ABA]'
  // SCSS/Sass/Less — pink (VS Code Seti: #F55385)
  if (['scss', 'sass', 'less'].includes(ext)) return 'text-[#F55385]'
  // HTML — orange (VS Code Seti: #E44D26)
  if (['html', 'htm'].includes(ext)) return 'text-[#E44D26]'
  // Vue — green (VS Code Seti: #8DC149)
  if (['vue'].includes(ext)) return 'text-[#8DC149]'
  // Svelte — orange-red (VS Code Seti: #E44D26)
  if (['svelte'].includes(ext)) return 'text-[#E44D26]'
  // Astro — orange
  if (['astro'].includes(ext)) return 'text-[#E8AB53]'
  // Python — blue (VS Code Seti: #519ABA)
  if (['py', 'pyw', 'pyi'].includes(ext)) return 'text-[#519ABA]'
  // Rust — orange (VS Code Seti: #DEA584)
  if (['rs'].includes(ext)) return 'text-[#DEA584]'
  // Go — cyan (VS Code Seti: #519ABA)
  if (['go'].includes(ext)) return 'text-[#519ABA]'
  // Ruby — red (VS Code Seti: #CC3E44)
  if (['rb', 'erb'].includes(ext)) return 'text-[#CC3E44]'
  // Java — red (VS Code Seti: #CC3E44)
  if (['java'].includes(ext)) return 'text-[#CC3E44]'
  // C/C++ — blue (VS Code Seti: #519ABA)
  if (['c', 'h'].includes(ext)) return 'text-[#519ABA]'
  if (['cpp', 'cc', 'cxx', 'hpp', 'hxx'].includes(ext)) return 'text-[#519ABA]'
  // C# — green (VS Code Seti: #8DC149)
  if (['cs'].includes(ext)) return 'text-[#8DC149]'
  // PHP — purple (VS Code Seti: #A074C4)
  if (['php'].includes(ext)) return 'text-[#A074C4]'
  // Swift — orange (VS Code Seti: #E8AB53)
  if (['swift'].includes(ext)) return 'text-[#E8AB53]'
  // Kotlin — purple (VS Code Seti: #A074C4)
  if (['kt', 'kts'].includes(ext)) return 'text-[#A074C4]'
  // Markdown — blue (VS Code Seti: #519ABA)
  if (['md', 'mdx'].includes(ext)) return 'text-[#519ABA]'
  // Text/docs — white
  if (['txt', 'rst'].includes(ext)) return 'text-[#D4D4D4]'
  if (['docx', 'doc'].includes(ext)) return 'text-[#519ABA]'
  if (['xlsx', 'xls'].includes(ext)) return 'text-[#8DC149]'
  if (['csv'].includes(ext)) return 'text-[#8DC149]'
  // YAML — purple (VS Code Seti: #A074C4)
  if (['yaml', 'yml'].includes(ext)) return 'text-[#A074C4]'
  // TOML — grey
  if (['toml'].includes(ext)) return 'text-[#9AA5B1]'
  // XML — orange (VS Code Seti: #E8AB53)
  if (['xml', 'xsl', 'xslt'].includes(ext)) return 'text-[#E8AB53]'
  // Shell — green (VS Code Seti: #8DC149)
  if (['sh', 'bash', 'zsh', 'fish', 'ps1'].includes(ext)) return 'text-[#8DC149]'
  // SQL — yellow (VS Code Seti: #CBCB41)
  if (['sql'].includes(ext)) return 'text-[#CBCB41]'
  // GraphQL — pink (VS Code Seti: #F55385)
  if (['graphql', 'gql'].includes(ext)) return 'text-[#F55385]'
  // Env files — yellow
  if (['env', 'env.local', 'env.example'].includes(filename.replace(/^\./, '')) || ext === 'env') return 'text-[#CBCB41]'
  // Lock files — dimmed (VS Code Seti: #41535B)
  if (['lock'].includes(ext) || filename.endsWith('.lock')) return 'text-[#41535B]'
  // Images — purple (VS Code Seti: #A074C4)
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff'].includes(ext)) return 'text-[#A074C4]'
  // Video — red
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'text-[#CC3E44]'
  // Audio — pink
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return 'text-[#F55385]'
  // Archives — yellow
  if (['zip', 'tar', 'gz', 'bz2', 'rar', '7z'].includes(ext)) return 'text-[#CBCB41]'
  // Config files — grey (VS Code Seti: #9AA5B1)
  if (['config', 'rc', 'ini', 'cfg'].includes(ext)) return 'text-[#9AA5B1]'
  // Database — yellow
  if (['db', 'sqlite'].includes(ext)) return 'text-[#CBCB41]'

  return 'text-[#9AA5B1]'
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

export default function FileTreeNode({ entry, depth, groupId, gitRef, gitRepoRoot }: FileTreeNodeProps): React.ReactElement {
  const [children, setChildren] = useState<FileEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(entry.name)
  const [creating, setCreating] = useState<CreatingType>(null)
  const [newName, setNewName] = useState('')
  const createInputRef = useRef<HTMLInputElement>(null)

  const { isExpanded, toggleExpanded, selectedPath, setSelectedPath, rootPath, gitStatusMap } = useSidebarStore()
  const { addTab } = useTabsStore()
  const { focusedGroupId, setFocusedGroup } = useLayoutStore()

  // Compute git status for this entry
  const relativePath = rootPath ? entry.path.replace(rootPath + '/', '') : entry.name
  const fileGitStatus = gitStatusMap.get(relativePath)
  // For directories, check if any child file has a git status
  const dirHasChanges = entry.isDirectory && !gitRef && Array.from(gitStatusMap.keys()).some(p => p.startsWith(relativePath + '/'))

  const expanded = isExpanded(entry.path)
  const isSelected = selectedPath === entry.path
  const renameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (renameTimerRef.current) clearTimeout(renameTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (expanded && entry.isDirectory && children.length === 0) {
      loadChildren()
    }
  }, [expanded])

  async function loadChildren() {
    setIsLoading(true)
    const result = gitRef && gitRepoRoot
      ? await window.electronAPI.gitLsTree(gitRepoRoot, gitRef, entry.path)
      : await window.electronAPI.readDir(entry.path)
    setChildren(result)
    setIsLoading(false)
  }

  async function refreshChildren() {
    if (expanded && entry.isDirectory) {
      setIsLoading(true)
      const result = gitRef && gitRepoRoot
        ? await window.electronAPI.gitLsTree(gitRepoRoot, gitRef, entry.path)
        : await window.electronAPI.readDir(entry.path)
      setChildren(result)
      setIsLoading(false)
    }
  }

  function handleClick() {
    if (entry.isDirectory) {
      toggleExpanded(entry.path)
      if (!expanded && children.length === 0) loadChildren()
      setSelectedPath(entry.path)
    } else {
      // If already selected, start a delayed rename (not in virtual mode)
      if (!gitRef && isSelected && !isRenaming) {
        if (renameTimerRef.current) clearTimeout(renameTimerRef.current)
        renameTimerRef.current = setTimeout(() => {
          setIsRenaming(true)
          setRenameValue(entry.name)
        }, 400)
      }
      setSelectedPath(entry.path)
    }
  }

  function handleDoubleClick() {
    // Cancel any pending rename from single-click
    if (renameTimerRef.current) {
      clearTimeout(renameTimerRef.current)
      renameTimerRef.current = null
    }
    if (entry.isDirectory) {
      if (gitRef) {
        useSidebarStore.getState().setVirtualPath(entry.path)
      } else {
        useSidebarStore.getState().setRootPath(entry.path)
      }
    } else {
      openFile()
    }
  }

  function openFile() {
    const layoutGroupIds = useLayoutStore.getState().getAllGroupIds()
    // If the file is already open in a visible group, focus that tab
    for (const [gid, group] of Object.entries(useTabsStore.getState().groups)) {
      if (!layoutGroupIds.includes(gid)) continue
      const existing = group.tabs.find(t =>
        t.filePath === entry.path && (t.gitRef || null) === (gitRef || null)
      )
      if (existing) {
        useTabsStore.getState().setActiveTab(gid, existing.id)
        setFocusedGroup(gid)
        return
      }
    }
    const targetGroupId = (focusedGroupId && layoutGroupIds.includes(focusedGroupId))
      ? focusedGroupId
      : groupId

    const tabData: any = {
      type: extensionRegistry.getTabTypeForFile(entry.name),
      title: gitRef ? `${entry.name} [${gitRef}]` : entry.name,
      filePath: entry.path,
    }
    if (gitRef && gitRepoRoot) {
      tabData.gitRef = gitRef
      tabData.gitRepoRoot = gitRepoRoot
    }
    addTab(targetGroupId, tabData)
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

  function openClaudeHere() {
    // For files, open Claude in the parent directory; for directories, use the directory itself
    const cwd = entry.isDirectory ? entry.path : entry.path.substring(0, entry.path.lastIndexOf('/'))
    const layoutGroupIds = useLayoutStore.getState().getAllGroupIds()
    const targetGroupId = (focusedGroupId && layoutGroupIds.includes(focusedGroupId))
      ? focusedGroupId
      : groupId
    const id = nextSessionId('claude-code')
    addTab(targetGroupId, {
      id,
      type: 'claude-code',
      title: id,
      filePath: cwd,
      initialCommand: 'claude\n',
    })
  }

  function openTerminalHere() {
    const cwd = entry.isDirectory ? entry.path : entry.path.substring(0, entry.path.lastIndexOf('/'))
    saveTerminalCwd(cwd)
    const layoutGroupIds = useLayoutStore.getState().getAllGroupIds()
    const targetGroupId = (focusedGroupId && layoutGroupIds.includes(focusedGroupId))
      ? focusedGroupId
      : groupId
    addTab(targetGroupId, { type: 'terminal', title: 'Terminal', filePath: cwd })
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
              'text-ui-base',
              isSelected && 'bg-zinc-800 text-zinc-100',
              entry.name.startsWith('.') && 'opacity-50'
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
                  <FolderOpen className="w-3.5 h-3.5 text-[#C09553] shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-[#C09553] shrink-0" />
                )}
              </>
            ) : (
              <>
                <span className="w-3 h-3 shrink-0" />
                {React.createElement(getFileIcon(entry.name), {
                  className: cn('w-3.5 h-3.5 shrink-0', getIconColor(entry.name))
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
              <span className={cn(
                'truncate',
                fileGitStatus === 'untracked' && 'text-green-400',
                fileGitStatus === 'modified' && 'text-amber-400',
                fileGitStatus === 'deleted' && 'text-red-400 line-through',
                !fileGitStatus && dirHasChanges && 'text-amber-400/70',
              )}>{entry.name}</span>
            )}
            {fileGitStatus === 'untracked' && (
              <span className="shrink-0 text-[9px] font-bold text-green-400 ml-auto">U</span>
            )}
            {fileGitStatus === 'modified' && (
              <span className="shrink-0 text-[9px] font-bold text-amber-400 ml-auto">M</span>
            )}
            {fileGitStatus === 'deleted' && (
              <span className="shrink-0 text-[9px] font-bold text-red-400 ml-auto">D</span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-zinc-900/80 backdrop-blur-xl border-zinc-700 min-w-[140px]">
          {entry.isFile && (
            <ContextMenuItem className="text-ui-base text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100" onClick={openFile}>
              <FileUp className="w-3.5 h-3.5 mr-2" />
              Open
            </ContextMenuItem>
          )}
          {!gitRef && entry.isDirectory && (
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
          <ContextMenuItem className="text-ui-base text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100" onClick={openClaudeHere}>
            <Bot className="w-3.5 h-3.5 mr-2" />
            Open Claude here
          </ContextMenuItem>
          <ContextMenuItem className="text-ui-base text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100" onClick={openTerminalHere}>
            <Terminal className="w-3.5 h-3.5 mr-2" />
            Open Terminal here
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-zinc-700" />
          <ContextMenuItem className="text-ui-base text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100" onClick={() => navigator.clipboard.writeText(entry.path)}>
            <Copy className="w-3.5 h-3.5 mr-2" />
            Copy Path
          </ContextMenuItem>
          <ContextMenuItem className="text-ui-base text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100" onClick={() => {
            const root = useSidebarStore.getState().rootPath
            const rel = root && entry.path.startsWith(root + '/')
              ? entry.path.slice(root.length + 1)
              : entry.path
            navigator.clipboard.writeText(rel)
          }}>
            <Copy className="w-3.5 h-3.5 mr-2" />
            Copy Relative Path
          </ContextMenuItem>
          {!gitRef && (
            <>
              <ContextMenuSeparator className="bg-zinc-700" />
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
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {expanded && entry.isDirectory && (
        <div>
          {!gitRef && creating && (
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
              gitRef={gitRef}
              gitRepoRoot={gitRepoRoot}
            />
          ))}
        </div>
      )}
    </div>
  )
}
