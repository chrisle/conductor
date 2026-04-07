import React, { useState, useEffect, useCallback } from 'react'
import { Download, Trash2, Package, RefreshCw, Puzzle, ChevronRight, FolderOpen, FolderCode, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { extensionRegistry } from '@/extensions'
import { loadExtension, loadExtensionsFromDevPaths } from '@/extensions/loader'
import { useConfigStore } from '@/store/config'
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
  const [installedExtensions, setInstalledExtensions] = useState<InstalledExtension[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const devPaths = useConfigStore(s => s.config.extensions.devPaths)
  const setExtensionDevPaths = useConfigStore(s => s.setExtensionDevPaths)

  const loadInstalled = useCallback(async () => {
    try {
      const list = await window.electronAPI.listExtensions()
      setInstalledExtensions(list)
    } catch {
      setInstalledExtensions([])
    }
  }, [])

  useEffect(() => {
    loadInstalled()
  }, [loadInstalled])

  // Hot-load ZIP-installed extensions when installed without requiring a restart
  useEffect(() => {
    const unsubscribe = window.electronAPI.onExtensionInstalled(async (extensionId) => {
      const extensionsDir = await window.electronAPI.getExtensionsDir()
      await loadExtension(`${extensionsDir}/${extensionId}`)
      await loadInstalled()
    })
    return unsubscribe
  }, [loadInstalled])

  async function handleInstall() {
    const zipPath = await window.electronAPI.selectExtensionZip()
    if (!zipPath) return

    setLoading(true)
    setMessage(null)

    try {
      const result = await window.electronAPI.installExtension(zipPath)
      if (result.success) {
        setMessage({ type: 'success', text: `Installed "${result.extensionId}".` })
        await loadInstalled()
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
      if (!result.success) {
        setMessage({ type: 'error', text: result.error || 'Failed to load extension' })
        return
      }
      // Load the extension first — if it fails we won't persist the path
      await loadExtension(dirPath)
      // Avoid duplicates: remove existing entry for this path before re-adding
      const updated = [...devPaths.filter(p => p !== dirPath), dirPath]
      await setExtensionDevPaths(updated)
      setMessage({ type: 'success', text: `Loaded "${result.extensionId}".` })
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
        await loadInstalled()
      } else {
        setMessage({ type: 'error', text: result.error || 'Uninstall failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setLoading(false)
    }
  }

  async function handleUnloadDev(dirPath: string) {
    setLoading(true)
    setMessage(null)

    try {
      // Read the manifest to get the extension id for unregistering
      const manifestResult = await window.electronAPI.readFile(`${dirPath}/manifest.json`)
      if (manifestResult.success && manifestResult.content) {
        const manifest = JSON.parse(manifestResult.content)
        if (manifest.id) extensionRegistry.unregister(manifest.id)
      }
      await setExtensionDevPaths(devPaths.filter(p => p !== dirPath))
      setMessage({ type: 'success', text: 'Extension unloaded.' })
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setLoading(false)
    }
  }

  async function handleReloadDev(dirPath: string) {
    setLoading(true)
    setMessage(null)
    try {
      await loadExtension(dirPath)
      setMessage({ type: 'success', text: 'Extension reloaded.' })
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setLoading(false)
    }
  }

  const builtinExtensions = extensionRegistry.getAllExtensions().filter(
    e => extensionRegistry.isBuiltin(e.id)
  )

  return (
    <SidebarLayout
      title="Extensions"
      actions={[
        { icon: RefreshCw, label: 'Refresh', onClick: loadInstalled },
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
          {/* Dev/unpacked extensions */}
          {devPaths.length > 0 && (
            <>
              <div className="px-1 py-1.5 text-ui-sm text-zinc-500 uppercase tracking-wider font-medium">
                Dev (Unpacked)
              </div>
              {devPaths.map(dirPath => (
                <div
                  key={dirPath}
                  className="flex items-start gap-2 px-2 py-2 rounded hover:bg-zinc-800/50 group transition-colors"
                >
                  <FolderCode className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-ui-base text-zinc-200 truncate">{dirPath.split('/').pop()}</div>
                    <div className="text-ui-sm text-zinc-600 truncate">{dirPath}</div>
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleReloadDev(dirPath)}
                          disabled={loading}
                          className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Reload</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Unload"
                          onClick={() => handleUnloadDev(dirPath)}
                          disabled={loading}
                          className="h-6 w-6 text-zinc-500 hover:text-red-400"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Unload</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
              <Separator className="my-2 bg-zinc-800" />
            </>
          )}

          {/* Installed extensions (ZIP) */}
          {installedExtensions.length > 0 && (
            <>
              <div className="px-1 py-1.5 text-ui-sm text-zinc-500 uppercase tracking-wider font-medium">
                Installed
              </div>
              {installedExtensions.map(ext => (
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
          {installedExtensions.length === 0 && devPaths.length === 0 && builtinExtensions.length === 0 && (
            <div className="px-3 py-8 text-center text-ui-base text-zinc-600">
              No extensions installed
            </div>
          )}
        </div>
      </ScrollArea>
    </SidebarLayout>
  )
}
