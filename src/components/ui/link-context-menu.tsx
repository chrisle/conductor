import React from 'react'
import { Globe, ExternalLink } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'

interface LinkContextMenuProps {
  url: string
  title?: string
  children: React.ReactNode
}

/**
 * Wraps any element to provide a right-click context menu with:
 * - Open in Conductor (in-app browser tab)
 * - Open in System Browser (external)
 */
export function LinkContextMenu({ url, title, children }: LinkContextMenuProps) {
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()

  function openInConductor() {
    const groups = useTabsStore.getState().groups
    const targetGroup = focusedGroupId || Object.keys(groups)[0]
    if (!targetGroup) return
    addTab(targetGroup, {
      type: 'browser',
      title: title || url.replace(/^https?:\/\//, '').slice(0, 40),
      url,
    })
  }

  function openInSystemBrowser() {
    window.open(url)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={openInConductor}>
          <Globe className="w-3.5 h-3.5 mr-2" />
          Open in Conductor
        </ContextMenuItem>
        <ContextMenuItem onClick={openInSystemBrowser}>
          <ExternalLink className="w-3.5 h-3.5 mr-2" />
          Open in System Browser
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
