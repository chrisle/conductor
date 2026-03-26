/**
 * Extension Host API - the curated surface area exposed to external extensions.
 * External extensions access this via window.__conductorAPI__
 */
import React from 'react'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import { useActivityBarStore } from '@/store/activityBar'

// Re-export UI primitives extensions can use
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const conductorAPI = {
  // React (shared instance so hooks work)
  React,

  // Stores
  useTabsStore,
  useLayoutStore,
  useSidebarStore,
  useActivityBarStore,

  // UI components
  ui: {
    Button,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
    Separator,
    ScrollArea,
    Badge
  },

  // Utilities
  cn
}

export type ConductorAPI = typeof conductorAPI

export function mountConductorAPI(): void {
  ;(window as any).__conductorAPI__ = conductorAPI
}
