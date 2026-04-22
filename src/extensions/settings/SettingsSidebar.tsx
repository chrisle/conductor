import React, { useState, useEffect, useCallback } from 'react'
import {
  Server, ChevronRight, ScrollText, Download, Trash2,
  Package, RefreshCw, Puzzle,
} from 'lucide-react'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
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

  // Re-render when extensions are toggled
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    return extensionRegistry.subscribe(() => forceUpdate(n => n + 1))
  }, [])

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

  const settingsPanels = extensionRegistry.getSettingsPanels()

  const conductorDaemonItems = [
    { id: 'conductord-settings', label: 'Settings', icon: Server, tabType: 'settings-terminal-service' },
    { id: 'conductord-logs', label: 'Logs', icon: ScrollText, tabType: 'conductord-logs' },
  ]

  return (
    <SidebarLayout title="Settings">
      <ScrollArea className="flex-1">
        <div className="py-1">
          {/* Extension-contributed settings panels */}
          {settingsPanels.map(({ extension, panel, subPanels }) => {
            const renderables: { key: string; label: string; Panel: React.ComponentType }[] = []
            if (subPanels && subPanels.length > 0) {
              for (const sp of subPanels) renderables.push({ key: sp.id, label: sp.label, Panel: sp.panel })
            } else if (panel) {
              renderables.push({ key: extension.id, label: extension.name, Panel: panel })
            }
            return (
              <React.Fragment key={extension.id}>
                {renderables.map(({ key, label, Panel }) => (
                  <React.Fragment key={key}>
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger className="flex items-center gap-1 px-3 py-1.5 w-full group cursor-pointer">
                        <ChevronRight className="w-3 h-3 text-zinc-500 transition-transform group-data-[state=open]:rotate-90" />
                        <span className="text-ui-sm text-zinc-400 uppercase tracking-wider font-medium">{label}</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-3 py-2">
                          <Panel />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    <Separator className="my-2 bg-zinc-700/50" />
                  </React.Fragment>
                ))}
              </React.Fragment>
            )
          })}

          {/* Conductor Daemon */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-1 px-3 py-1.5 w-full group cursor-pointer">
              <ChevronRight className="w-3 h-3 text-zinc-500 transition-transform group-data-[state=open]:rotate-90" />
              <span className="text-ui-sm text-zinc-400 uppercase tracking-wider font-medium">Conductor Daemon</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {conductorDaemonItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => openTab(item.tabType, item.label)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/50 transition-colors group"
                >
                  <item.icon className="w-4 h-4 text-zinc-400 group-hover:text-zinc-300 shrink-0" />
                  <span className="text-ui-base text-zinc-300 group-hover:text-zinc-100 truncate">{item.label}</span>
                  <ChevronRight className="w-3 h-3 text-zinc-500 ml-auto shrink-0" />
                </button>
              ))}
            </CollapsibleContent>
          </Collapsible>

          <Separator className="my-2 bg-zinc-700/50" />

          {/* Extensions */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-1 px-3 py-1.5 w-full group cursor-pointer">
              <ChevronRight className="w-3 h-3 text-zinc-500 transition-transform group-data-[state=open]:rotate-90" />
              <span className="text-ui-sm text-zinc-400 uppercase tracking-wider font-medium">Extensions</span>
              <div className="ml-auto flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" onClick={loadExtensions} className="h-5 w-5 text-zinc-400 hover:text-zinc-200">
                  <RefreshCw className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleInstallExtension} disabled={extLoading} className="h-5 w-5 text-zinc-400 hover:text-zinc-200">
                  <Download className="w-3 h-3" />
                </Button>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {/* Status message */}
              {extMessage && (
                <div className={`mx-3 mb-2 px-2 py-1.5 text-ui-base rounded ${
                  extMessage.type === 'success' ? 'text-green-400 bg-green-950/30' : 'text-red-400 bg-red-950/30'
                }`}>
                  {extMessage.text}
                </div>
              )}

              {/* Installed external extensions */}
              {externalExtensions.map(ext => {
                const enabled = extensionRegistry.isEnabled(ext.id)
                return (
                  <div
                    key={ext.id}
                    className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/50 transition-colors group ${!enabled ? 'opacity-50' : ''}`}
                  >
                    <Package className="w-4 h-4 text-zinc-400 group-hover:text-zinc-300 shrink-0" />
                    <span className="text-ui-base text-zinc-300 group-hover:text-zinc-100 truncate">{ext.name}</span>
                    <div className="ml-auto flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => extensionRegistry.setEnabled(ext.id, !enabled)}
                        className={`relative w-7 h-4 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-zinc-700'}`}
                        title={enabled ? 'Disable' : 'Enable'}
                      >
                        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${enabled ? 'left-3.5' : 'left-0.5'}`} />
                      </button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUninstallExtension(ext.id)}
                            disabled={extLoading}
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Uninstall</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )
              })}

              {/* Built-in extensions */}
              {builtinExtensions.map(ext => {
                const Icon = ext.icon || Puzzle
                return (
                  <div
                    key={ext.id}
                    className="w-full flex items-center gap-2 px-3 py-2 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="text-ui-base text-zinc-300 truncate">{ext.name}</span>
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
