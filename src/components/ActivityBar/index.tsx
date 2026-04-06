import React, { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { extensionRegistry } from '@/extensions'
import { useActivityBarStore } from '@/store/activityBar'
import { useSettingsDialogStore } from '@/store/settingsDialog'
import { useNotificationsStore } from '@/store/notifications'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export default function ActivityBar(): React.ReactElement {
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    return extensionRegistry.subscribe(() => forceUpdate(n => n + 1))
  }, [])

  const allSidebarExtensions = extensionRegistry.getSidebarExtensions()
  const { activeExtensionId, toggleExtension } = useActivityBarStore()
  const openSettings = useSettingsDialogStore(s => s.setOpen)

  // Settings opens a dialog instead of a sidebar
  const bottomIds = new Set(['extensions', 'conductord', 'settings'])
  const mainExtensions = allSidebarExtensions.filter(ext => !bottomIds.has(ext.id) && ext.id !== 'settings')
  const bottomExtensions = allSidebarExtensions.filter(ext => bottomIds.has(ext.id) && ext.id !== 'settings')

  const unreadCount = useNotificationsStore(s => s.notifications.filter(n => !n.read).length)

  // Build a map from extension id to its keyboard shortcut display string.
  // All sidebar extensions (excluding settings) get ⌘1, ⌘2, ... in toolbar order.
  const allPanels = allSidebarExtensions.filter(ext => ext.id !== 'settings')
  const panelShortcutMap = new Map<string, string>()
  allPanels.forEach((ext, i) => {
    if (i < 9) {
      panelShortcutMap.set(ext.id, `⌘${i + 1}`)
    }
  })

  const renderIcon = (ext: typeof allSidebarExtensions[0]) => {
    const Icon = ext.icon!
    const isActive = activeExtensionId === ext.id
    const showBadge = ext.id === 'notifications' && unreadCount > 0
    const shortcut = panelShortcutMap.get(ext.id)
    return (
      <Tooltip key={ext.id}>
        <TooltipTrigger asChild>
          <button
            onClick={() => toggleExtension(ext.id)}
            className={cn(
              'relative flex items-center justify-center w-10 h-10 transition-colors',
              isActive
                ? 'text-white border-l-2 border-l-blue-400 bg-zinc-800/60'
                : 'text-zinc-500 border-l-2 border-l-transparent hover:text-zinc-200'
            )}
          >
            <Icon className="w-5 h-5" />
            {showBadge && (
              <span className="absolute top-1.5 right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {ext.name}
          {shortcut && <span className="ml-2 text-zinc-500">{shortcut}</span>}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col items-center w-10 shrink-0 bg-zinc-900/80 border-r border-zinc-700/50 py-1 gap-1">
        {mainExtensions.map(renderIcon)}
        <div className="flex-1" />
        {bottomExtensions.map(renderIcon)}
        {/* Settings icon — opens dialog */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => openSettings(true)}
              className="flex items-center justify-center w-10 h-10 transition-colors text-zinc-500 border-l-2 border-l-transparent hover:text-zinc-200"
            >
              <Settings className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
