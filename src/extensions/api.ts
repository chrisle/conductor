/**
 * Extension Host API - the curated surface area exposed to external extensions.
 * External extensions access this via window.__conductorAPI__
 *
 * The loader's createExtensionRequire() maps virtual module names to slices of
 * this object so that extension bundles can `require('@conductor/extension-api')`
 * (or subpaths like `@conductor/extension-api/stores`) and get the host-provided
 * implementations.
 */
import React from 'react'

// ── Stores ──────────────────────────────────────────────────────────────────
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import { useActivityBarStore } from '@/store/activityBar'
import { useConfigStore } from '@/store/config'
import { useProjectStore } from '@/store/project'
import { useWorkSessionsStore } from '@/store/work-sessions'

// ── UI Components ───────────────────────────────────────────────────────────
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from '@/components/ui/collapsible'
import { LinkContextMenu } from '@/components/ui/link-context-menu'
import ClaudeIcon from '@/components/ui/ClaudeIcon'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

// ── Session info registry ──────────────────────────────────────────────────
import { useSessionInfoRegistry } from '@/extensions/work-sessions'

// ── Libraries ───────────────────────────────────────────────────────────────
import { cn } from '@/lib/utils'
import { killTerminal } from '@/lib/terminal-api'
import {
  getThinkingState, stripAnsi, type ThinkingState,
} from '@/lib/terminal-detection'

export const conductorAPI = {
  // React (shared instance so hooks work)
  React,

  // Stores
  useTabsStore,
  useLayoutStore,
  useSidebarStore,
  useActivityBarStore,
  useConfigStore,
  useProjectStore,
  useWorkSessionsStore,

  // UI components
  ui: {
    Button,
    Badge,
    Skeleton,
    Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
    Separator,
    ScrollArea,
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogFooter, DialogDescription,
    ContextMenu, ContextMenuTrigger, ContextMenuContent,
    ContextMenuItem, ContextMenuSeparator,
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
    DropdownMenuItem, DropdownMenuSeparator,
    Collapsible, CollapsibleTrigger, CollapsibleContent,
    LinkContextMenu,
    ClaudeIcon,
    SidebarLayout,
    VisuallyHidden,
  },

  // Session info registry
  useSessionInfoRegistry,

  // Utilities
  cn,
  killTerminal,
  getThinkingState,
  stripAnsi,
}

export type ConductorAPI = typeof conductorAPI

export function mountConductorAPI(): void {
  ;(window as any).__conductorAPI__ = conductorAPI
}
