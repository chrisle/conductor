import React, { useEffect, useState } from 'react'
import { Terminal, GitBranch, FolderOpen, RefreshCw, FilePlus, FolderPlus, Bot, ExternalLink } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import { resolveTerminalCwd, saveTerminalCwd } from '@/lib/terminal-cwd'
import { nextSessionId } from '@/lib/session-id'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'
import type { SidebarAction } from '@/components/Sidebar/SidebarHeader'
import FileTree from '@/components/Sidebar/FileTree'

interface FileExplorerSidebarProps {
  groupId: string
}

export default function FileExplorerSidebar({ groupId }: FileExplorerSidebarProps): React.ReactElement {
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const { rootPath } = useSidebarStore()
  const [isGitRepo, setIsGitRepo] = useState(false)

  useEffect(() => {
    if (!rootPath) { setIsGitRepo(false); return }
    window.electronAPI.gitBranch(rootPath).then(branch => setIsGitRepo(branch !== null))
  }, [rootPath])

  function openNewTerminal() {
    const targetGroup = focusedGroupId || groupId
    const cwd = resolveTerminalCwd()
    saveTerminalCwd(cwd)
    addTab(targetGroup, { type: 'terminal', title: 'Terminal', filePath: cwd })
  }

  function openClaudeHere() {
    const cwd = rootPath || '/'
    const targetGroup = focusedGroupId || groupId
    const id = nextSessionId('claude-code')
    addTab(targetGroup, {
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
    const targetGroup = focusedGroupId || groupId
    addTab(targetGroup, { type: 'terminal', title: 'Terminal', filePath: cwd })
  }
  function openGitGraph() {
    const targetGroup = focusedGroupId || groupId
    addTab(targetGroup, { type: 'git-graph', title: 'Git Graph', filePath: rootPath || undefined })
  }

  const actions: SidebarAction[] = [
    { icon: RefreshCw, label: 'Refresh', onClick: () => window.dispatchEvent(new Event('sidebar:refresh')) },
    { icon: Terminal, label: 'New terminal', onClick: openNewTerminal },
  ]

  if (isGitRepo) {
    actions.push({ icon: GitBranch, label: 'Git graph', onClick: openGitGraph })
  }

  // Format the current directory for display
  const displayPath = rootPath
    ? rootPath.replace(/^\/Users\/[^/]+/, '~')
    : ''

  return (
    <SidebarLayout
      title="Files"
      actions={actions}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex flex-col flex-1 overflow-hidden min-h-0">
            {rootPath && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-700/50 shrink-0 min-w-0">
                <FolderOpen className="w-3 h-3 text-zinc-500 shrink-0" />
                <span
                  className="text-ui-xs text-zinc-400 truncate block"
                  dir="rtl"
                  title={rootPath}
                >
                  <bdi>{displayPath}</bdi>
                </span>
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <FileTree groupId={groupId} />
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-zinc-900 border-zinc-700 min-w-[140px]">
          <ContextMenuItem
            className="gap-2 text-xs cursor-pointer"
            onClick={() => window.dispatchEvent(new CustomEvent('sidebar:new', { detail: { type: 'file' } }))}
          >
            <FilePlus className="w-3.5 h-3.5" />
            New File
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2 text-xs cursor-pointer"
            onClick={() => window.dispatchEvent(new CustomEvent('sidebar:new', { detail: { type: 'folder' } }))}
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
          <ContextMenuItem
            className="gap-2 text-xs cursor-pointer"
            onClick={() => {
              if (rootPath) window.electronAPI.openExternal(`file://${rootPath}`)
            }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {window.electronAPI.platform === 'darwin' ? 'Open in Finder' : 'Open in File Explorer'}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </SidebarLayout>
  )
}
