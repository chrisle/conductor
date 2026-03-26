import React, { useState, useEffect, useCallback } from 'react'
import {
  Server, ChevronRight, ScrollText, Download, Trash2,
  Package, RefreshCw, Puzzle,
} from 'lucide-react'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { extensionRegistry } from '@/extensions'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'

interface SettingsSidebarProps {
  groupId: string
}

interface InstalledExtension {
  id: string
  name: string
  version: string
  description?: string
}

export default function SettingsSidebar({ groupId }: SettingsSidebarProps): React.ReactElement {
  const { addTab, setActiveTab, groups } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()

  // Extensions state
  const [externalExtensions, setExternalExtensions] = useState<InstalledExtension[]>([])
  const [extLoading, setExtLoading] = useState(false)
  const [extMessage, setExtMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadExtensions = useCallback(async () => {
    try {
      const list = await window.electronAPI.listExtensions()
      setExternalExtensions(list)
    } catch {
      setExternalExtensions([])
    }
  }, [])

  useEffect(() => {
    loadExtensions()
  }, [loadExtensions])

  function openTab(tabType: string, label: string) {
    const targetGroup = focusedGroupId || groupId
    const group = groups[targetGroup]
    if (group) {
      const existing = group.tabs.find(t => t.type === tabType)
      if (existing) {
        setActiveTab(targetGroup, existing.id)
        return
      }
    }
    addTab(targetGroup, { type: tabType, title: label })
  }

  async function handleInstallExtension() {
    const zipPath = await window.electronAPI.selectExtensionZip()
    if (!zipPath) return

    setExtLoading(true)
    setExtMessage(null)

    try {
      const result = await window.electronAPI.installExtension(zipPath)
      if (result.success) {
        setExtMessage({ type: 'success', text: `Installed "${result.extensionId}". Restart to activate.` })
        await loadExtensions()
      } else {
        setExtMessage({ type: 'error', text: result.error || 'Install failed' })
      }
    } catch (err) {
      setExtMessage({ type: 'error', text: String(err) })
    } finally {
      setExtLoading(false)
    }
  }

  async function handleUninstallExtension(extensionId: string) {
    setExtLoading(true)
    setExtMessage(null)

    try {
      const result = await window.electronAPI.uninstallExtension(extensionId)
      if (result.success) {
        setExtMessage({ type: 'success', text: `Uninstalled "${extensionId}". Restart to take effect.` })
        await loadExtensions()
      } else {
        setExtMessage({ type: 'error', text: result.error || 'Uninstall failed' })
      }
    } catch (err) {
      setExtMessage({ type: 'error', text: String(err) })
    } finally {
      setExtLoading(false)
    }
  }

  const builtinExtensions = extensionRegistry.getAllExtensions().filter(
    e => !externalExtensions.some(ext => ext.id === e.id)
  )

  const settingsItems = [
    { id: 'terminal-service', label: 'Terminal Service', icon: Server, tabType: 'settings-terminal-service' },
  ]

  const conductordItems = [
    { id: 'conductord-logs', label: 'Conductord Logs', icon: ScrollText, tabType: 'conductord-logs' },
  ]

  return (
    <SidebarLayout title="Settings">
      <ScrollArea className="flex-1">
        <div className="py-1">
          {/* Settings items */}
          {settingsItems.map(item => (
            <button
              key={item.id}
              onClick={() => openTab(item.tabType, item.label)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/50 transition-colors group"
            >
              <item.icon className="w-4 h-4 text-zinc-500 group-hover:text-zinc-400 shrink-0" />
              <span className="text-xs text-zinc-300 group-hover:text-zinc-100 truncate">{item.label}</span>
              <ChevronRight className="w-3 h-3 text-zinc-600 ml-auto shrink-0" />
            </button>
          ))}

          {/* Conductord items */}
          {conductordItems.map(item => (
            <button
              key={item.id}
              onClick={() => openTab(item.tabType, item.label)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/50 transition-colors group"
            >
              <item.icon className="w-4 h-4 text-zinc-500 group-hover:text-zinc-400 shrink-0" />
              <span className="text-xs text-zinc-300 group-hover:text-zinc-100 truncate">{item.label}</span>
              <ChevronRight className="w-3 h-3 text-zinc-600 ml-auto shrink-0" />
            </button>
          ))}

          <Separator className="my-2 bg-zinc-800" />

          {/* Extensions section */}
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Extensions</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={loadExtensions} className="h-5 w-5 text-zinc-500 hover:text-zinc-300">
                <RefreshCw className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleInstallExtension} disabled={extLoading} className="h-5 w-5 text-zinc-500 hover:text-zinc-300">
                <Download className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Status message */}
          {extMessage && (
            <div className={`mx-3 mb-2 px-2 py-1.5 text-xs rounded ${
              extMessage.type === 'success' ? 'text-green-400 bg-green-950/30' : 'text-red-400 bg-red-950/30'
            }`}>
              {extMessage.text}
            </div>
          )}

          {/* Installed external extensions */}
          {externalExtensions.map(ext => (
            <div
              key={ext.id}
              className="flex items-start gap-2 px-3 py-2 hover:bg-zinc-800/50 group transition-colors"
            >
              <Package className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-200 truncate">{ext.name}</span>
                  <Badge variant="outline" className="h-4 px-1 text-[9px] border-zinc-700 text-zinc-500">
                    v{ext.version}
                  </Badge>
                </div>
                {ext.description && (
                  <div className="text-[11px] text-zinc-500 truncate">{ext.description}</div>
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleUninstallExtension(ext.id)}
                    disabled={extLoading}
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Uninstall</TooltipContent>
              </Tooltip>
            </div>
          ))}

          {/* Built-in extensions */}
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="flex items-center gap-1 px-3 py-1.5 w-full group cursor-pointer">
              <ChevronRight className="w-3 h-3 text-zinc-500 transition-transform group-data-[state=open]:rotate-90" />
              <span className="text-[11px] text-zinc-500 font-medium">
                Built-in
              </span>
              <Badge variant="outline" className="ml-auto h-4 px-1.5 text-[9px] border-zinc-700 text-zinc-600">
                {builtinExtensions.length}
              </Badge>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {builtinExtensions.map(ext => {
                const Icon = ext.icon || Puzzle
                return (
                  <div
                    key={ext.id}
                    className="flex items-start gap-2 px-3 py-2 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-zinc-300 truncate">{ext.name}</span>
                        {ext.version && (
                          <Badge variant="outline" className="h-4 px-1 text-[9px] border-zinc-700 text-zinc-600">
                            v{ext.version}
                          </Badge>
                        )}
                      </div>
                      {ext.description && (
                        <div className="text-[11px] text-zinc-600">{ext.description}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
    </SidebarLayout>
  )
}
