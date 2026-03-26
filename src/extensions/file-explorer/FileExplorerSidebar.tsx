import React from 'react'
import { Terminal, Globe, FilePlus, FolderPlus } from 'lucide-react'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'
import FileTree from '@/components/Sidebar/FileTree'

interface FileExplorerSidebarProps {
  groupId: string
}

export default function FileExplorerSidebar({ groupId }: FileExplorerSidebarProps): React.ReactElement {
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const { rootPath } = useSidebarStore()

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
  function openNewBrowser() {
    const targetGroup = focusedGroupId || groupId
    addTab(targetGroup, { type: 'browser', title: 'Browser', url: 'https://google.com' })
  }

  return (
    <SidebarLayout
      title="Files"
      actions={[
        { icon: FilePlus, label: 'New file', onClick: triggerNewFile },
        { icon: FolderPlus, label: 'New folder', onClick: triggerNewFolder },
        { icon: Terminal, label: 'New terminal', onClick: openNewTerminal },
        { icon: Globe, label: 'New browser', onClick: openNewBrowser },
      ]}
      separatorAfter={1}
    >
      <div className="flex-1 overflow-hidden">
        <FileTree groupId={groupId} />
      </div>
    </SidebarLayout>
  )
}
