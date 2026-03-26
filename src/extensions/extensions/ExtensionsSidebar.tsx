import React, { useState, useEffect, useCallback } from 'react'
import { Download, Trash2, Package, RefreshCw, Puzzle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { extensionRegistry } from '@/extensions'

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

  async function handleInstall() {
    const zipPath = await window.electronAPI.selectExtensionZip()
    if (!zipPath) return

    setLoading(true)
    setMessage(null)

    try {
      const result = await window.electronAPI.installExtension(zipPath)
      if (result.success) {
        setMessage({ type: 'success', text: `Installed "${result.extensionId}". Restart to activate.` })
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

  async function handleUninstall(extensionId: string) {
    setLoading(true)
    setMessage(null)

    try {
      const result = await window.electronAPI.uninstallExtension(extensionId)
      if (result.success) {
        setMessage({ type: 'success', text: `Uninstalled "${extensionId}". Restart to take effect.` })
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
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col h-full overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Extensions</span>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={loadExtensions} className="h-6 w-6">
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleInstall} disabled={loading} className="h-6 w-6">
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Install from .zip</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Status message */}
        {message && (
          <div className={`px-3 py-2 text-xs border-b border-zinc-800 ${
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
                <div className="px-1 py-1.5 text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
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
                        <span className="text-xs text-zinc-200 truncate">{ext.name}</span>
                        <Badge variant="outline" className="h-4 px-1 text-[9px] border-zinc-700 text-zinc-500">
                          v{ext.version}
                        </Badge>
                      </div>
                      {ext.description && (
                        <div className="text-[11px] text-zinc-500 truncate">{ext.description}</div>
                      )}
                      <div className="text-[11px] text-zinc-600 truncate">{ext.id}</div>
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
            <div className="px-1 py-1.5 text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
              Built-in
            </div>
            {builtinExtensions.map(ext => {
              const Icon = ext.icon || Puzzle
              const tabCount = ext.tabs?.length || 0
              const hasSidebar = !!ext.sidebar
              const description = [
                tabCount > 0 && `${tabCount} tab${tabCount > 1 ? 's' : ''}`,
                hasSidebar && 'sidebar'
              ].filter(Boolean).join(', ')
              return (
                <div
                  key={ext.id}
                  className="flex items-start gap-2 px-2 py-2 rounded transition-colors"
                >
                  <Icon className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-zinc-300 truncate">{ext.name}</span>
                      <Badge variant="outline" className="h-4 px-1 text-[9px] border-zinc-700 text-zinc-600">
                        built-in
                      </Badge>
                    </div>
                    {description && (
                      <div className="text-[11px] text-zinc-600">{description}</div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Empty state */}
            {externalExtensions.length === 0 && builtinExtensions.length === 0 && (
              <div className="px-3 py-8 text-center text-xs text-zinc-600">
                No extensions installed
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer hint */}
        <div className="px-3 py-2 border-t border-zinc-800 text-[11px] text-zinc-600">
          Install extensions from .zip files built with the Conductor Extension SDK
        </div>
      </div>
    </TooltipProvider>
  )
}
