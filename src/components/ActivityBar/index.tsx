import React from 'react'
import { cn } from '@/lib/utils'
import { extensionRegistry } from '@/extensions'
import { useActivityBarStore } from '@/store/activityBar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export default function ActivityBar(): React.ReactElement {
  const sidebarExtensions = extensionRegistry.getSidebarExtensions()
  const { activeExtensionId, toggleExtension } = useActivityBarStore()

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col items-center w-10 shrink-0 bg-zinc-900 border-r border-zinc-800 py-1 gap-1">
        {sidebarExtensions.map(ext => {
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
                      ? 'text-zinc-100 border-l-2 border-l-blue-500 bg-zinc-800/50'
                      : 'text-zinc-500 border-l-2 border-l-transparent hover:text-zinc-300'
                  )}
                >
                  <Icon className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{ext.name}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
