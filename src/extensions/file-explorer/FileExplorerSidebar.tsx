import React, { useEffect, useState } from 'react'
import { Terminal, FilePlus, FolderPlus, GitBranch } from 'lucide-react'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
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

  function triggerNewFile() {
    window.dispatchEvent(new CustomEvent('sidebar:new', { detail: { type: 'file' } }))
  }
  function triggerNewFolder() {
    window.dispatchEvent(new CustomEvent('sidebar:new', { detail: { type: 'folder' } }))
  }
  function openNewTerminal() {
    const targetGroup = focusedGroupId || groupId
    addTab(targetGroup, { type: 'terminal', title: 'Terminal', filePath: rootPath || undefined })
  }
  function openGitGraph() {
    const targetGroup = focusedGroupId || groupId
    addTab(targetGroup, { type: 'git-graph', title: 'Git Graph', filePath: rootPath || undefined })
  }

  const actions: SidebarAction[] = [
    { icon: FilePlus, label: 'New file', onClick: triggerNewFile },
    { icon: FolderPlus, label: 'New folder', onClick: triggerNewFolder },
    { icon: Terminal, label: 'New terminal', onClick: openNewTerminal },
  ]

  if (isGitRepo) {
    actions.push({ icon: GitBranch, label: 'Git graph', onClick: openGitGraph })
  }

  return (
    <SidebarLayout
      title="Files"
      actions={actions}
      separatorAfter={1}
    >
      <div className="flex-1 overflow-hidden">
        <FileTree groupId={groupId} />
      </div>
    </SidebarLayout>
  )
}
