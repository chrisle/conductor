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
  /** Label for the in-app browser action (default: "Go to Kanban Board") */
  openInAppLabel?: string
  /** Label for the external browser action (default: "Open Jira") */
  openExternalLabel?: string
}

/**
 * Wraps any element to provide a right-click context menu with:
 * - Go to Kanban Board (in-app browser tab)
 * - Open Jira (external)
 *
 * Labels can be customized via openInAppLabel / openExternalLabel props.
 */
export function LinkContextMenu({ url, title, children, openInAppLabel = 'Go to Kanban Board', openExternalLabel = 'Open Jira' }: LinkContextMenuProps) {
  const focusedGroupId = useLayoutStore(s => s.focusedGroupId)

  function openInConductor() {
    const groups = useTabsStore.getState().groups
    const targetGroup = focusedGroupId || Object.keys(groups)[0]
    if (!targetGroup) return
    useTabsStore.getState().addTab(targetGroup, {
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
          {openInAppLabel}
        </ContextMenuItem>
        <ContextMenuItem onClick={openInSystemBrowser}>
          <ExternalLink className="w-3.5 h-3.5 mr-2" />
          {openExternalLabel}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
