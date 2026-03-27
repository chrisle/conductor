import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { extensionRegistry } from '@/extensions'
import { useActivityBarStore } from '@/store/activityBar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export default function ActivityBar(): React.ReactElement {
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    return extensionRegistry.subscribe(() => forceUpdate(n => n + 1))
  }, [])

  const allSidebarExtensions = extensionRegistry.getSidebarExtensions()
  const { activeExtensionId, toggleExtension } = useActivityBarStore()

  const bottomIds = new Set(['extensions', 'conductord', 'settings'])
  const mainExtensions = allSidebarExtensions.filter(ext => !bottomIds.has(ext.id))
  const bottomExtensions = allSidebarExtensions.filter(ext => bottomIds.has(ext.id))

  const renderIcon = (ext: typeof allSidebarExtensions[0]) => {
    const Icon = ext.icon!
    const isActive = activeExtensionId === ext.id
    return (
      <Tooltip key={ext.id}>
        <TooltipTrigger asChild>
          <button
            onClick={() => toggleExtension(ext.id)}
            className={cn(
              'flex items-center justify-center w-10 h-10 transition-colors',
              isActive
                ? 'text-white border-l-2 border-l-blue-400 bg-zinc-800/60'
                : 'text-zinc-500 border-l-2 border-l-transparent hover:text-zinc-200'
            )}
          >
            <Icon className="w-5 h-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{ext.name}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col items-center w-10 shrink-0 bg-zinc-900/80 border-r border-zinc-700/50 py-1 gap-1">
        {mainExtensions.map(renderIcon)}
        <div className="flex-1" />
        {bottomExtensions.map(renderIcon)}
      </div>
    </TooltipProvider>
  )
}
