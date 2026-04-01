import React, { useState, useEffect, useCallback } from 'react'
import {
  Server, Download, Trash2,
  Package, RefreshCw, Puzzle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogTitle,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { useSettingsDialogStore } from '@/store/settingsDialog'
import { extensionRegistry } from '@/extensions'
import { ConductorDaemonPanel } from '@/extensions/settings/TerminalServiceTab'

interface InstalledExtension {
  id: string
  name: string
  version: string
  description?: string
}

export default function SettingsDialog(): React.ReactElement {
  const { open, setOpen, activeSection, setActiveSection } = useSettingsDialogStore()

  const [, forceUpdate] = useState(0)
  useEffect(() => {
    return extensionRegistry.subscribe(() => forceUpdate(n => n + 1))
  }, [])

  const settingsPanels = extensionRegistry.getSettingsPanels()

  // Build nav items: extension panels + conductor daemon + extensions
  const navItems: { id: string; label: string; icon: React.ElementType }[] = [
    ...settingsPanels.map(({ extension }) => ({
      id: extension.id,
      label: extension.name,
      icon: extension.icon || Puzzle,
    })),
    { id: 'conductor-daemon', label: 'Conductor Daemon', icon: Server },
    { id: 'extensions', label: 'Extensions', icon: Package },
  ]

  // Default to first section if current active section doesn't exist
  const validIds = new Set(navItems.map(n => n.id))
  const currentSection = validIds.has(activeSection) ? activeSection : navItems[0]?.id ?? ''

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-5xl w-[90vw] h-[70vh] p-0 gap-0 bg-zinc-900 border-zinc-700 overflow-hidden"
      >
        <VisuallyHidden><DialogTitle>Settings</DialogTitle></VisuallyHidden>
        <div className="flex h-full">
          {/* Side nav */}
          <nav className="w-48 shrink-0 border-r border-zinc-800 bg-zinc-900/80 py-3 flex flex-col">
            <h2 className="px-4 mb-3 text-sm font-semibold text-zinc-200">Settings</h2>
            <div className="flex flex-col gap-0.5 px-2">
              {navItems.map(item => {
                const Icon = item.icon
                const isActive = currentSection === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors text-xs',
                      isActive
                        ? 'bg-zinc-700/60 text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Content area */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-6">
                <SettingsContent section={currentSection} settingsPanels={settingsPanels} />
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SettingsContent({
  section,
  settingsPanels,
}: {
  section: string
  settingsPanels: ReturnType<typeof extensionRegistry.getSettingsPanels>
}): React.ReactElement {
  // Extension-contributed settings panel
  const panelMatch = settingsPanels.find(p => p.extension.id === section)
  if (panelMatch) {
    const Panel = panelMatch.panel
    return (
      <div>
        <h3 className="text-sm font-medium text-zinc-200 mb-4">{panelMatch.extension.name}</h3>
        <Panel />
      </div>
    )
  }

  if (section === 'conductor-daemon') {
    return <ConductorDaemonSection />
  }

  if (section === 'extensions') {
    return <ExtensionsSection />
  }

  return <div className="text-xs text-zinc-500">Select a section from the sidebar.</div>
}

function ConductorDaemonSection(): React.ReactElement {
  return <ConductorDaemonPanel />
}

function ExtensionsSection(): React.ReactElement {
  const [externalExtensions, setExternalExtensions] = useState<InstalledExtension[]>([])
  const [extLoading, setExtLoading] = useState(false)
  const [extMessage, setExtMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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

  return (
    <TooltipProvider delayDuration={400}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-zinc-200">Extensions</h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={loadExtensions} className="h-7 w-7 text-zinc-400 hover:text-zinc-200">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleInstallExtension} disabled={extLoading} className="h-7 w-7 text-zinc-400 hover:text-zinc-200">
              <Download className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {extMessage && (
          <div className={`mb-3 px-3 py-2 text-xs rounded ${
            extMessage.type === 'success' ? 'text-green-400 bg-green-950/30' : 'text-red-400 bg-red-950/30'
          }`}>
            {extMessage.text}
          </div>
        )}

        {/* Installed external extensions */}
        {externalExtensions.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">Installed</div>
            <div className="space-y-1">
              {externalExtensions.map(ext => {
                const enabled = extensionRegistry.isEnabled(ext.id)
                return (
                  <div
                    key={ext.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md bg-zinc-800/50 hover:bg-zinc-800 transition-colors group',
                      !enabled && 'opacity-50',
                    )}
                  >
                    <Package className="w-4 h-4 text-zinc-400 group-hover:text-zinc-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-zinc-200 truncate">{ext.name}</div>
                      {ext.description && (
                        <div className="text-[10px] text-zinc-500 truncate">{ext.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => extensionRegistry.setEnabled(ext.id, !enabled)}
                        className={cn(
                          'relative w-8 h-4.5 rounded-full transition-colors',
                          enabled ? 'bg-blue-600' : 'bg-zinc-700',
                        )}
                        title={enabled ? 'Disable' : 'Enable'}
                      >
                        <span className={cn(
                          'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform',
                          enabled ? 'left-4' : 'left-0.5',
                        )} />
                      </button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUninstallExtension(ext.id)}
                            disabled={extLoading}
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Uninstall</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Built-in extensions */}
        <div>
          <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">Built-in</div>
          <div className="space-y-1">
            {builtinExtensions.map(ext => {
              const Icon = ext.icon || Puzzle
              return (
                <div
                  key={ext.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md bg-zinc-800/30"
                >
                  <Icon className="w-4 h-4 text-zinc-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-300 truncate">{ext.name}</div>
                    {ext.description && (
                      <div className="text-[10px] text-zinc-500 truncate">{ext.description}</div>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-600 shrink-0">v{ext.version}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
