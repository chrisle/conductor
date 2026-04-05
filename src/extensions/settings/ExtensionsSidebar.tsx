import React, { useState, useEffect, useCallback } from 'react'
import { Download, Trash2, Package, RefreshCw, Puzzle, ChevronRight, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { extensionRegistry } from '@/extensions'
import { loadExtension } from '@/extensions/loader'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'

interface InstalledExtension {
  id: string
  name: string
  version: string
  description?: string
}

interface ExtensionsSidebarProps {
  groupId: string
}

export default function ExtensionsSidebar({ groupId }: ExtensionsSidebarProps): React.ReactElement {
  const [externalExtensions, setExternalExtensions] = useState<InstalledExtension[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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

  // Hot-load extensions when installed without requiring a restart
  useEffect(() => {
    const unsubscribe = window.electronAPI.onExtensionInstalled(async (extensionId) => {
      const extensionsDir = await window.electronAPI.getExtensionsDir()
      await loadExtension(`${extensionsDir}/${extensionId}`)
      await loadExtensions()
    })
    return unsubscribe
  }, [loadExtensions])

  async function handleInstall() {
    const zipPath = await window.electronAPI.selectExtensionZip()
    if (!zipPath) return

    setLoading(true)
    setMessage(null)

    try {
      const result = await window.electronAPI.installExtension(zipPath)
      if (result.success) {
        setMessage({ type: 'success', text: `Installed "${result.extensionId}".` })
        await loadExtensions()
      } else {
        setMessage({ type: 'error', text: result.error || 'Install failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setLoading(false)
    }
  }

  async function handleLoadUnpacked() {
    const dirPath = await window.electronAPI.selectExtensionDir()
    if (!dirPath) return

    setLoading(true)
    setMessage(null)

    try {
      const result = await window.electronAPI.installUnpackedExtension(dirPath)
      if (result.success) {
        setMessage({ type: 'success', text: `Loaded "${result.extensionId}".` })
        await loadExtensions()
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to load extension' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setLoading(false)
    }
  }

  async function handleUninstall(extensionId: string) {
    setLoading(true)
    setMessage(null)

    try {
      const result = await window.electronAPI.uninstallExtension(extensionId)
      if (result.success) {
        extensionRegistry.unregister(extensionId)
        setMessage({ type: 'success', text: `Uninstalled "${extensionId}".` })
        await loadExtensions()
      } else {
        setMessage({ type: 'error', text: result.error || 'Uninstall failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setLoading(false)
    }
  }

  const builtinExtensions = extensionRegistry.getAllExtensions().filter(
    e => !externalExtensions.some(ext => ext.id === e.id)
  )

  return (
    <SidebarLayout
      title="Extensions"
      actions={[
        { icon: RefreshCw, label: 'Refresh', onClick: loadExtensions },
        { icon: FolderOpen, label: 'Load Unpacked', onClick: handleLoadUnpacked, disabled: loading },
        { icon: Download, label: 'Install from .zip', onClick: handleInstall, disabled: loading },
      ]}
      footer="Install extensions from .zip files or load unpacked folders built with the Conductor Extension SDK"
    >
      {/* Status message */}
      {message && (
        <div className={`px-3 py-2 text-ui-base border-b border-zinc-800 ${
          message.type === 'success' ? 'text-green-400 bg-green-950/30' : 'text-red-400 bg-red-950/30'
        }`}>
          {message.text}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Installed external extensions */}
          {externalExtensions.length > 0 && (
            <>
              <div className="px-1 py-1.5 text-ui-sm text-zinc-500 uppercase tracking-wider font-medium">
                Installed
              </div>
              {externalExtensions.map(ext => (
                <div
                  key={ext.id}
                  className="flex items-start gap-2 px-2 py-2 rounded hover:bg-zinc-800/50 group transition-colors"
                >
                  <Package className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-ui-base text-zinc-200 truncate">{ext.name}</span>
                      <Badge variant="outline" className="h-4 px-1 text-ui-xs border-zinc-700 text-zinc-500">
                        v{ext.version}
                      </Badge>
                    </div>
                    {ext.description && (
                      <div className="text-ui-sm text-zinc-500 truncate">{ext.description}</div>
                    )}
                    <div className="text-ui-sm text-zinc-600 truncate">{ext.id}</div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleUninstall(ext.id)}
                        disabled={loading}
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Uninstall</TooltipContent>
                  </Tooltip>
                </div>
              ))}
              <Separator className="my-2 bg-zinc-800" />
            </>
          )}

          {/* Built-in extensions */}
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="flex items-center gap-1 px-1 py-1.5 w-full group cursor-pointer">
              <ChevronRight className="w-3 h-3 text-zinc-500 transition-transform group-data-[state=open]:rotate-90" />
              <span className="text-ui-sm text-zinc-500 uppercase tracking-wider font-medium">
                Built-in
              </span>
              <Badge variant="outline" className="ml-auto h-4 px-1.5 text-ui-xs border-zinc-700 text-zinc-600">
                {builtinExtensions.length}
              </Badge>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {builtinExtensions.map(ext => {
                const Icon = ext.icon || Puzzle
                return (
                  <div
                    key={ext.id}
                    className="flex items-start gap-2 px-2 py-2 rounded transition-colors"
                  >
                    <Icon className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-ui-base text-zinc-300 truncate">{ext.name}</span>
                        {ext.version && (
                          <Badge variant="outline" className="h-4 px-1 text-ui-xs border-zinc-700 text-zinc-600">
                            v{ext.version}
                          </Badge>
                        )}
                      </div>
                      {ext.description && (
                        <div className="text-ui-sm text-zinc-600">{ext.description}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </CollapsibleContent>
          </Collapsible>

          {/* Empty state */}
          {externalExtensions.length === 0 && builtinExtensions.length === 0 && (
            <div className="px-3 py-8 text-center text-ui-base text-zinc-600">
              No extensions installed
            </div>
          )}
        </div>
      </ScrollArea>
    </SidebarLayout>
  )
}
