import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Server, Download, Trash2,
  Package, RefreshCw, Puzzle, Monitor, Palette, Keyboard, RotateCcw, FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogTitle,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { useSettingsDialogStore } from '@/store/settingsDialog'
import { useConfigStore } from '@/store/config'
import { extensionRegistry } from '@/extensions'
import { loadExtension } from '@/extensions/loader'
import { ConductorDaemonPanel } from '@/extensions/settings/TerminalServiceTab'
import { DEFAULT_TERMINAL_CUSTOMIZATION, DEFAULT_EDITOR_CUSTOMIZATION, DEFAULT_KEYBOARD_SHORTCUTS } from '@/types/app-config'
import type { TerminalCustomization, EditorCustomization } from '@/types/app-config'

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

  // Build nav items: extension panels + appearance + shortcuts + terminal + system tray + extensions
  const navItems: { id: string; label: string; icon: React.ElementType }[] = [
    ...settingsPanels.map(({ extension }) => ({
      id: extension.id,
      label: extension.name,
      icon: extension.icon || Puzzle,
    })),
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'keyboard-shortcuts', label: 'Shortcuts', icon: Keyboard },
    { id: 'terminal', label: 'Terminal', icon: Monitor },
    { id: 'conductor-daemon', label: 'System Tray', icon: Server },
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
        {/* min-h-0 prevents the grid child from growing past the dialog's h-[70vh] */}
        <div className="flex h-full min-h-0">
          {/* Side nav */}
          {/* Settings nav — ScrollArea ensures all items are reachable when the list exceeds dialog height */}
          <nav className="w-48 shrink-0 border-r border-zinc-800 bg-zinc-900/80 py-3 flex flex-col overflow-hidden">
            <h2 className="px-4 mb-3 text-ui-base font-semibold text-zinc-200 shrink-0">Settings</h2>
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-0.5 px-2">
                {navItems.map(item => {
                  const Icon = item.icon
                  const isActive = currentSection === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors text-ui-sm',
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
            </ScrollArea>
          </nav>

          {/* Content area */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="pt-10 px-6 pb-6">
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
        <h3 className="text-ui-base font-medium text-zinc-200 mb-4">{panelMatch.extension.name}</h3>
        <Panel />
      </div>
    )
  }

  if (section === 'appearance') {
    return <AppearanceSection />
  }

  if (section === 'keyboard-shortcuts') {
    return <KeyboardShortcutsSection />
  }

  if (section === 'terminal') {
    return <TerminalSection />
  }

  if (section === 'conductor-daemon') {
    return <ConductorDaemonSection />
  }

  if (section === 'extensions') {
    return <ExtensionsSection />
  }

  return <div className="text-ui-base text-zinc-500">Select a section from the sidebar.</div>
}

// ── Shared setting row component ──

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-ui-sm text-zinc-200">{label}</div>
        {description && <div className="text-ui-xs text-zinc-500 mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }): React.ReactElement {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-ui-sm text-zinc-200 outline-none focus:border-zinc-500 w-44"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function NumberInput({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }): React.ReactElement {
  return (
    <input
      type="number"
      value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      min={min}
      max={max}
      step={step}
      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-ui-sm text-zinc-200 outline-none focus:border-zinc-500 w-20 text-right"
    />
  )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }): React.ReactElement {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-ui-sm text-zinc-200 outline-none focus:border-zinc-500 w-64"
    />
  )
}

// ── Appearance Section (Terminal + Editor) ──

function AppearanceSection(): React.ReactElement {
  const termConfig = useConfigStore(s => s.config.customization.terminal)
  const editorConfig = useConfigStore(s => s.config.customization.editor)
  const setTerminal = useConfigStore(s => s.setTerminalCustomization)
  const setEditor = useConfigStore(s => s.setEditorCustomization)
  const resetCustomization = useConfigStore(s => s.resetCustomization)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-ui-base font-medium text-zinc-200">Appearance</h3>
        <Button variant="ghost" size="sm" onClick={resetCustomization} className="gap-1.5 text-zinc-400 hover:text-zinc-200 text-ui-xs">
          <RotateCcw className="w-3 h-3" />
          Reset All
        </Button>
      </div>

      {/* Terminal settings */}
      <div className="mb-6">
        <div className="text-ui-sm text-zinc-500 uppercase tracking-wider mb-3">Terminal</div>
        <div className="divide-y divide-zinc-800">
          <SettingRow label="Font Family" description="Monospace font for terminal text">
            <TextInput value={termConfig.fontFamily} onChange={v => setTerminal({ fontFamily: v })} />
          </SettingRow>
          <SettingRow label="Font Size" description="Size in pixels">
            <NumberInput value={termConfig.fontSize} onChange={v => setTerminal({ fontSize: v })} min={8} max={32} />
          </SettingRow>
          <SettingRow label="Line Height" description="Multiplier for line spacing">
            <NumberInput value={termConfig.lineHeight} onChange={v => setTerminal({ lineHeight: v })} min={0.8} max={2.0} step={0.1} />
          </SettingRow>
          <SettingRow label="Cursor Style">
            <SelectInput
              value={termConfig.cursorStyle}
              onChange={v => setTerminal({ cursorStyle: v as TerminalCustomization['cursorStyle'] })}
              options={[
                { value: 'block', label: 'Block' },
                { value: 'underline', label: 'Underline' },
                { value: 'bar', label: 'Bar' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Cursor Blink">
            <Switch checked={termConfig.cursorBlink} onCheckedChange={v => setTerminal({ cursorBlink: v })} />
          </SettingRow>
          <SettingRow label="Color Theme" description="Changes apply to new terminals">
            <SelectInput
              value={termConfig.colorTheme}
              onChange={v => setTerminal({ colorTheme: v as TerminalCustomization['colorTheme'] })}
              options={[
                { value: 'default', label: 'Default (Zinc)' },
                { value: 'monokai', label: 'Monokai' },
                { value: 'solarized-dark', label: 'Solarized Dark' },
                { value: 'dracula', label: 'Dracula' },
                { value: 'nord', label: 'Nord' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Scrollback Lines" description="Max lines kept in terminal history (applies to new terminals)">
            <NumberInput value={termConfig.scrollback} onChange={v => setTerminal({ scrollback: v })} min={1000} max={100000} step={1000} />
          </SettingRow>
        </div>
      </div>

      {/* Editor settings */}
      <div>
        <div className="text-ui-sm text-zinc-500 uppercase tracking-wider mb-3">Editor</div>
        <div className="divide-y divide-zinc-800">
          <SettingRow label="Font Family" description="Monospace font for code editing">
            <TextInput value={editorConfig.fontFamily} onChange={v => setEditor({ fontFamily: v })} />
          </SettingRow>
          <SettingRow label="Font Size" description="Size in pixels">
            <NumberInput value={editorConfig.fontSize} onChange={v => setEditor({ fontSize: v })} min={8} max={32} />
          </SettingRow>
          <SettingRow label="Line Height" description="Multiplier for line spacing">
            <NumberInput value={editorConfig.lineHeight} onChange={v => setEditor({ lineHeight: v })} min={1.0} max={3.0} step={0.1} />
          </SettingRow>
          <SettingRow label="Tab Size" description="Number of spaces per tab">
            <NumberInput value={editorConfig.tabSize} onChange={v => setEditor({ tabSize: v })} min={1} max={8} />
          </SettingRow>
          <SettingRow label="Word Wrap">
            <SelectInput
              value={editorConfig.wordWrap}
              onChange={v => setEditor({ wordWrap: v as EditorCustomization['wordWrap'] })}
              options={[
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
                { value: 'wordWrapColumn', label: 'At Column' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Minimap">
            <Switch checked={editorConfig.minimap} onCheckedChange={v => setEditor({ minimap: v })} />
          </SettingRow>
          <SettingRow label="Render Whitespace">
            <SelectInput
              value={editorConfig.renderWhitespace}
              onChange={v => setEditor({ renderWhitespace: v as EditorCustomization['renderWhitespace'] })}
              options={[
                { value: 'none', label: 'None' },
                { value: 'selection', label: 'Selection' },
                { value: 'all', label: 'All' },
              ]}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  )
}

// ── Keyboard Shortcuts Section ──

function KeyboardShortcutsSection(): React.ReactElement {
  const shortcuts = useConfigStore(s => s.config.customization.keyboardShortcuts)
  const updateShortcut = useConfigStore(s => s.updateKeyboardShortcut)
  const setKeyboardShortcuts = useConfigStore(s => s.setKeyboardShortcuts)
  const [recordingId, setRecordingId] = useState<string | null>(null)

  function handleResetAll() {
    setKeyboardShortcuts([...DEFAULT_KEYBOARD_SHORTCUTS])
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-ui-base font-medium text-zinc-200">Keyboard Shortcuts</h3>
        <Button variant="ghost" size="sm" onClick={handleResetAll} className="gap-1.5 text-zinc-400 hover:text-zinc-200 text-ui-xs">
          <RotateCcw className="w-3 h-3" />
          Reset All
        </Button>
      </div>
      <div className="text-ui-xs text-zinc-500 mb-4">Click a shortcut to record a new binding. Press Escape to cancel.</div>
      <div className="divide-y divide-zinc-800">
        {shortcuts.map(shortcut => (
          <ShortcutRow
            key={shortcut.id}
            shortcut={shortcut}
            isRecording={recordingId === shortcut.id}
            onStartRecording={() => setRecordingId(shortcut.id)}
            onStopRecording={() => setRecordingId(null)}
            onUpdate={(keys) => {
              updateShortcut(shortcut.id, keys)
              setRecordingId(null)
            }}
          />
        ))}
      </div>
    </div>
  )
}

function ShortcutRow({
  shortcut,
  isRecording,
  onStartRecording,
  onStopRecording,
  onUpdate,
}: {
  shortcut: { id: string; label: string; keys: string }
  isRecording: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  onUpdate: (keys: string) => void
}): React.ReactElement {
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isRecording) return

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        onStopRecording()
        return
      }

      // Ignore bare modifier presses
      if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) return

      const parts: string[] = []
      if (e.metaKey) parts.push('Meta')
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.shiftKey) parts.push('Shift')
      if (e.altKey) parts.push('Alt')
      parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key)

      onUpdate(parts.join('+'))
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isRecording, onStopRecording, onUpdate])

  function formatKeys(keys: string): string {
    return keys
      .replace(/Meta/g, '\u2318')
      .replace(/Ctrl/g, '\u2303')
      .replace(/Shift/g, '\u21E7')
      .replace(/Alt/g, '\u2325')
      .replace(/\+/g, ' ')
      .replace(/\]/g, ']')
      .replace(/\[/g, '[')
  }

  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="text-ui-sm text-zinc-200">{shortcut.label}</div>
      <button
        ref={buttonRef}
        onClick={onStartRecording}
        className={cn(
          'px-3 py-1 rounded text-ui-sm font-mono transition-colors min-w-[120px] text-center',
          isRecording
            ? 'bg-blue-600/20 border border-blue-500 text-blue-300 animate-pulse'
            : 'bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-500'
        )}
      >
        {isRecording ? 'Press keys...' : formatKeys(shortcut.keys)}
      </button>
    </div>
  )
}

function TerminalSection(): React.ReactElement {
  return (
    <div>
      <h3 className="text-ui-base font-medium text-zinc-200 mb-4">Terminal</h3>
      <div className="text-ui-sm text-zinc-500">
        Terminal appearance settings have moved to the <strong className="text-zinc-300">Appearance</strong> section.
      </div>
    </div>
  )
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

  // Hot-load extensions when installed without requiring a restart
  useEffect(() => {
    const unsubscribe = window.electronAPI.onExtensionInstalled(async (extensionId) => {
      const extensionsDir = await window.electronAPI.getExtensionsDir()
      await loadExtension(`${extensionsDir}/${extensionId}`)
      await loadExtensions()
    })
    return unsubscribe
  }, [loadExtensions])

  async function handleInstallExtension() {
    const zipPath = await window.electronAPI.selectExtensionZip()
    if (!zipPath) return

    setExtLoading(true)
    setExtMessage(null)

    try {
      const result = await window.electronAPI.installExtension(zipPath)
      if (result.success) {
        setExtMessage({ type: 'success', text: `Installed "${result.extensionId}".` })
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

  async function handleLoadUnpacked() {
    const dirPath = await window.electronAPI.selectExtensionDir()
    if (!dirPath) return

    setExtLoading(true)
    setExtMessage(null)

    try {
      const result = await window.electronAPI.installUnpackedExtension(dirPath)
      if (result.success) {
        setExtMessage({ type: 'success', text: `Loaded "${result.extensionId}".` })
        await loadExtensions()
      } else {
        setExtMessage({ type: 'error', text: result.error || 'Failed to load extension' })
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
        extensionRegistry.unregister(extensionId)
        setExtMessage({ type: 'success', text: `Uninstalled "${extensionId}".` })
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
          <h3 className="text-ui-base font-medium text-zinc-200">Extensions</h3>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={loadExtensions} className="h-7 w-7 text-zinc-400 hover:text-zinc-200">
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleLoadUnpacked} disabled={extLoading} className="h-7 w-7 text-zinc-400 hover:text-zinc-200">
                  <FolderOpen className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Load Unpacked</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleInstallExtension} disabled={extLoading} className="h-7 w-7 text-zinc-400 hover:text-zinc-200">
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Install from .zip</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {extMessage && (
          <div className={`mb-3 px-3 py-2 text-ui-base rounded ${
            extMessage.type === 'success' ? 'text-green-400 bg-green-950/30' : 'text-red-400 bg-red-950/30'
          }`}>
            {extMessage.text}
          </div>
        )}

        {/* Installed external extensions */}
        {externalExtensions.length > 0 && (
          <div className="mb-4">
            <div className="text-ui-sm text-zinc-500 uppercase tracking-wider mb-2">Installed</div>
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
                      <div className="text-ui-base text-zinc-200 truncate">{ext.name}</div>
                      {ext.description && (
                        <div className="text-ui-xs text-zinc-500 truncate">{ext.description}</div>
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
          <div className="text-ui-sm text-zinc-500 uppercase tracking-wider mb-2">Built-in</div>
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
                    <div className="text-ui-base text-zinc-300 truncate">{ext.name}</div>
                    {ext.description && (
                      <div className="text-ui-xs text-zinc-500 truncate">{ext.description}</div>
                    )}
                  </div>
                  <span className="text-ui-xs text-zinc-600 shrink-0">v{ext.version}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
