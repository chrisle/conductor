import React from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'

export interface SidebarAction {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  spinning?: boolean
}

export interface SidebarHeaderProps {
  title: string
  subtitle?: React.ReactNode
  actions?: SidebarAction[]
  /** Insert a vertical separator after the action at this index (0-based) */
  separatorAfter?: number
  onSettings?: () => void
}

export default function SidebarHeader({
  title,
  subtitle,
  actions,
  separatorAfter,
  onSettings,
}: SidebarHeaderProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700/50 shrink-0">
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {title}
        </span>
        {subtitle && (
          <span className="text-[11px] text-zinc-300 truncate leading-tight">
            {subtitle}
          </span>
        )}
      </div>

      {(actions?.length || onSettings) && (
        <div className="flex items-center shrink-0">
          {actions?.map((action, i) => (
            <React.Fragment key={action.label}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={`h-6 w-6 ${action.className || 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    <action.icon
                      className={`w-3.5 h-3.5 ${action.spinning ? 'animate-spin' : ''}`}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{action.label}</TooltipContent>
              </Tooltip>
              {separatorAfter === i && (
                <Separator orientation="vertical" className="h-4 mx-1 bg-zinc-700/50" />
              )}
            </React.Fragment>
          ))}
          {onSettings && (
            <>
              {actions?.length ? (
                <Separator orientation="vertical" className="h-4 mx-1 bg-zinc-700/50" />
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onSettings}
                    className="h-6 w-6 text-zinc-400 hover:text-zinc-200"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      )}
    </div>
  )
}
