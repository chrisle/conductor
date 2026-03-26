import React from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import SidebarHeader, { type SidebarHeaderProps } from './SidebarHeader'

interface SidebarLayoutProps extends SidebarHeaderProps {
  children: React.ReactNode
  footer?: React.ReactNode
}

export default function SidebarLayout({
  children,
  footer,
  ...headerProps
}: SidebarLayoutProps): React.ReactElement {
  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col h-full overflow-hidden min-w-0 text-zinc-300">
        <SidebarHeader {...headerProps} />

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {footer && (
          <div className="px-3 py-1.5 border-t border-zinc-700/50 shrink-0 text-[10px] text-zinc-500 truncate">
            {footer}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
