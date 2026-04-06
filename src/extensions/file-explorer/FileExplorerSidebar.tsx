import React, { useEffect, useState } from 'react'
import { Terminal, GitBranch, FolderOpen } from 'lucide-react'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import { resolveTerminalCwd, saveTerminalCwd } from '@/lib/terminal-cwd'
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
  function openGitGraph() {
    const targetGroup = focusedGroupId || groupId
    addTab(targetGroup, { type: 'git-graph', title: 'Git Graph', filePath: rootPath || undefined })
  }

  const actions: SidebarAction[] = [
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
    </SidebarLayout>
  )
}
