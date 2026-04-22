import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Server, Download, Trash2,
  Package, RefreshCw, Puzzle, Monitor, Palette, Keyboard, RotateCcw, FolderOpen, FolderCode, X,
  ChevronDown, ChevronRight,
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
import { DEFAULT_TERMINAL_CUSTOMIZATION, DEFAULT_EDITOR_CUSTOMIZATION, DEFAULT_MARKDOWN_CUSTOMIZATION, DEFAULT_KEYBOARD_SHORTCUTS } from '@/types/app-config'
import type { TerminalCustomization, EditorCustomization, MarkdownCustomization } from '@/types/app-config'

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

  type NavItem = {
    id: string
    label: string
    icon: React.ElementType
    /** When present, the item renders as a collapsible parent; clicking a child selects `{parentId}/{childId}`. */
    children?: { id: string; label: string; icon?: React.ElementType }[]
  }

  const navItems: NavItem[] = [
    ...settingsPanels.map(({ extension, subPanels }): NavItem => ({
      id: extension.id,
      label: extension.name,
      icon: extension.icon || Puzzle,
      children: subPanels?.map(sp => ({ id: sp.id, label: sp.label, icon: sp.icon })),
    })),
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'keyboard-shortcuts', label: 'Shortcuts', icon: Keyboard },
    { id: 'terminal', label: 'Terminal', icon: Monitor },
    { id: 'conductor-daemon', label: 'System Tray', icon: Server },
    { id: 'extensions', label: 'Extensions', icon: Package },
  ]

  // Flat set of selectable section ids (leaf items + child paths like "ai-cli/claude-code")
  const validIds = new Set<string>()
  for (const item of navItems) {
    if (item.children && item.children.length > 0) {
      for (const child of item.children) validIds.add(`${item.id}/${child.id}`)
    } else {
      validIds.add(item.id)
    }
  }

  // Fallback to first leaf if activeSection is invalid. Parent-only ids resolve to their first child.
  const firstLeaf = (() => {
    const first = navItems[0]
    if (!first) return ''
    if (first.children && first.children.length > 0) return `${first.id}/${first.children[0].id}`
    return first.id
  })()
  const currentSection = validIds.has(activeSection) ? activeSection : firstLeaf

  // Auto-expand any parent whose child is currently active
  const [expandedParents, setExpandedParents] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const item of navItems) {
      if (item.children && currentSection.startsWith(`${item.id}/`)) initial.add(item.id)
    }
    return initial
  })

  function toggleParent(id: string) {
    setExpandedParents(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
                  const hasChildren = !!item.children && item.children.length > 0
                  const isParentActive = hasChildren && currentSection.startsWith(`${item.id}/`)
                  const isLeafActive = !hasChildren && currentSection === item.id
                  const isExpanded = hasChildren && (expandedParents.has(item.id) || isParentActive)

                  return (
                    <React.Fragment key={item.id}>
                      <button
                        onClick={() => {
                          if (hasChildren) {
                            // Opening a parent selects its first child AND expands
                            const firstChild = item.children![0]
                            setActiveSection(`${item.id}/${firstChild.id}`)
                            setExpandedParents(prev => new Set(prev).add(item.id))
                          } else {
                            setActiveSection(item.id)
                          }
                        }}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors text-ui-sm',
                          isLeafActive
                            ? 'bg-zinc-700/60 text-zinc-100'
                            : isParentActive
                              ? 'text-zinc-200'
                              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                        )}
                      >
                        {hasChildren && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleParent(item.id) }}
                            className="shrink-0 text-zinc-500 hover:text-zinc-300 -ml-1 p-0.5"
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded
                              ? <ChevronDown className="w-3 h-3" />
                              : <ChevronRight className="w-3 h-3" />}
                          </button>
                        )}
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>

                      {hasChildren && isExpanded && item.children!.map(child => {
                        const ChildIcon = child.icon
                        const childSectionId = `${item.id}/${child.id}`
                        const isChildActive = currentSection === childSectionId
                        return (
                          <button
                            key={child.id}
                            onClick={() => setActiveSection(childSectionId)}
                            className={cn(
                              'flex items-center gap-2 pl-8 pr-2 py-1.5 rounded text-left transition-colors text-ui-sm',
                              isChildActive
                                ? 'bg-zinc-700/60 text-zinc-100'
                                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                            )}
                          >
                            {ChildIcon && <ChildIcon className="w-3.5 h-3.5 shrink-0" />}
                            <span className="truncate">{child.label}</span>
                          </button>
                        )
                      })}
                    </React.Fragment>
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
  // Nested extension section: "{extensionId}/{subPanelId}"
  if (section.includes('/')) {
    const [extId, subId] = section.split('/', 2)
    const match = settingsPanels.find(p => p.extension.id === extId)
    const sub = match?.subPanels?.find(s => s.id === subId)
    if (match && sub) {
      const Panel = sub.panel
      return (
        <div>
          <h3 className="text-ui-base font-medium text-zinc-200 mb-4">{sub.label}</h3>
          <Panel />
        </div>
      )
    }
  }

  // Top-level extension-contributed settings panel
  const panelMatch = settingsPanels.find(p => p.extension.id === section)
  if (panelMatch && panelMatch.panel) {
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
  const markdownConfig = useConfigStore(s => s.config.customization.markdown)
  const setTerminal = useConfigStore(s => s.setTerminalCustomization)
  const setEditor = useConfigStore(s => s.setEditorCustomization)
  const setMarkdown = useConfigStore(s => s.setMarkdownCustomization)
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
          <SettingRow label="Default Shell" description="Shell to launch in new terminals (applies to new terminals)">
            <SelectInput
              value={termConfig.shell || 'default'}
              onChange={v => setTerminal({ shell: v })}
              options={
                window.electronAPI.platform === 'win32'
                  ? [
                      { value: 'default', label: 'Default (PowerShell)' },
                      { value: 'powershell', label: 'Windows PowerShell' },
                      { value: 'pwsh', label: 'PowerShell 7 (pwsh)' },
                      { value: 'cmd', label: 'Command Prompt' },
                      { value: 'git-bash', label: 'Git Bash' },
                    ]
                  : [
                      { value: 'default', label: 'Default ($SHELL)' },
                      { value: 'bash', label: 'Bash' },
                      { value: 'zsh', label: 'Zsh' },
                      { value: 'fish', label: 'Fish' },
                    ]
              }
            />
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

      {/* Markdown settings */}
      <div className="mt-6">
        <div className="text-ui-sm text-zinc-500 uppercase tracking-wider mb-3">Markdown</div>
        <div className="divide-y divide-zinc-800">
          <SettingRow label="Include Frontmatter in Preview" description="Show YAML frontmatter in the rendered preview">
            <Switch checked={markdownConfig.includeFrontmatter} onCheckedChange={v => setMarkdown({ includeFrontmatter: v })} />
          </SettingRow>
          <SettingRow label="Preview Background" description="Background color for the markdown preview pane">
            <SelectInput
              value={markdownConfig.background}
              onChange={v => setMarkdown({ background: v as MarkdownCustomization['background'] })}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
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
  const [installedExtensions, setInstalledExtensions] = useState<InstalledExtension[]>([])
  const [extLoading, setExtLoading] = useState(false)
  const [extMessage, setExtMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const devPaths = useConfigStore(s => s.config.extensions.devPaths)
  const setExtensionDevPaths = useConfigStore(s => s.setExtensionDevPaths)

  const [, forceUpdate] = useState(0)
  useEffect(() => {
    return extensionRegistry.subscribe(() => forceUpdate(n => n + 1))
  }, [])

  const loadExtensions = useCallback(async () => {
    try {
      const list = await window.electronAPI.listExtensions()
      setInstalledExtensions(list)
    } catch {
      setInstalledExtensions([])
    }
  }, [])

  useEffect(() => {
    loadExtensions()
  }, [loadExtensions])

  // Hot-load ZIP-installed extensions when installed without requiring a restart
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
      if (!result.success) {
        setExtMessage({ type: 'error', text: result.error || 'Failed to load extension' })
        return
      }
      await loadExtension(dirPath)
      const updated = [...devPaths.filter(p => p !== dirPath), dirPath]
      await setExtensionDevPaths(updated)
      setExtMessage({ type: 'success', text: `Loaded "${result.extensionId}".` })
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

  async function handleUnloadDev(dirPath: string) {
    setExtLoading(true)
    setExtMessage(null)
    try {
      const manifestResult = await window.electronAPI.readFile(`${dirPath}/manifest.json`)
      if (manifestResult.success && manifestResult.content) {
        const manifest = JSON.parse(manifestResult.content)
        if (manifest.id) extensionRegistry.unregister(manifest.id)
      }
      await setExtensionDevPaths(devPaths.filter(p => p !== dirPath))
      setExtMessage({ type: 'success', text: 'Extension unloaded.' })
    } catch (err) {
      setExtMessage({ type: 'error', text: String(err) })
    } finally {
      setExtLoading(false)
    }
  }

  // Collect all extensions into a unified list with metadata
  const allExtensions: {
    id: string
    name: string
    description?: string
    version?: string
    icon: React.ElementType
    builtin: boolean
    devPath?: string
    installed: boolean
    configPanel?: React.ComponentType
  }[] = []

  // Built-in extensions
  for (const ext of extensionRegistry.getAllExtensions()) {
    if (!extensionRegistry.isBuiltin(ext.id)) continue
    allExtensions.push({
      id: ext.id,
      name: ext.name,
      description: ext.description,
      version: ext.version,
      icon: ext.icon || Puzzle,
      builtin: true,
      installed: false,
      configPanel: ext.configPanel,
    })
  }

  // Installed extensions (ZIP)
  for (const ext of installedExtensions) {
    const registered = extensionRegistry.getExtension(ext.id)
    allExtensions.push({
      id: ext.id,
      name: ext.name,
      description: ext.description,
      version: ext.version,
      icon: registered?.icon || Package,
      builtin: false,
      installed: true,
      configPanel: registered?.configPanel,
    })
  }

  // Dev/unpacked extensions
  for (const dirPath of devPaths) {
    // Find the registered extension for this dev path
    const registeredExt = extensionRegistry.getAllExtensions().find(e =>
      !extensionRegistry.isBuiltin(e.id) && !installedExtensions.some(i => i.id === e.id)
    )
    if (registeredExt && !allExtensions.some(e => e.id === registeredExt.id)) {
      allExtensions.push({
        id: registeredExt.id,
        name: registeredExt.name,
        description: registeredExt.description,
        version: registeredExt.version,
        icon: registeredExt.icon || FolderCode,
        builtin: false,
        devPath: dirPath,
        installed: false,
        configPanel: registeredExt.configPanel,
      })
    }
  }

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
                <Button variant="ghost" size="icon" aria-label="Load Unpacked" onClick={handleLoadUnpacked} disabled={extLoading} className="h-7 w-7 text-zinc-400 hover:text-zinc-200">
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

        {/* Unified extension list */}
        <div className="space-y-1">
          {allExtensions.map(ext => {
            const Icon = ext.icon
            const enabled = extensionRegistry.isEnabled(ext.id)
            const isExpanded = expandedId === ext.id
            const hasConfigPanel = !!ext.configPanel
            const ConfigPanel = ext.configPanel

            return (
              <div key={ext.id} className="rounded-md bg-zinc-800/50 overflow-hidden">
                {/* Extension header row */}
                <div
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 transition-colors group',
                    hasConfigPanel ? 'hover:bg-zinc-800 cursor-pointer' : 'hover:bg-zinc-800',
                    !enabled && 'opacity-50',
                  )}
                  onClick={hasConfigPanel ? () => setExpandedId(isExpanded ? null : ext.id) : undefined}
                >
                  {/* Expand chevron or spacer */}
                  {hasConfigPanel ? (
                    isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}

                  <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-ui-base text-zinc-200 truncate">{ext.name}</span>
                      {ext.version && <span className="text-ui-xs text-zinc-600">v{ext.version}</span>}
                      {ext.builtin && <span className="text-ui-xs text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">built-in</span>}
                      {ext.devPath && <span className="text-ui-xs text-yellow-500 bg-yellow-950/30 px-1.5 py-0.5 rounded">dev</span>}
                    </div>
                    {ext.description && (
                      <div className="text-ui-xs text-zinc-500 truncate">{ext.description}</div>
                    )}
                  </div>

                  {/* Actions: enable/disable + uninstall/unload */}
                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    {!ext.builtin && (
                      <Switch
                        checked={enabled}
                        onCheckedChange={v => extensionRegistry.setEnabled(ext.id, v)}
                      />
                    )}
                    {ext.installed && (
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
                    )}
                    {ext.devPath && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Unload"
                            onClick={() => handleUnloadDev(ext.devPath!)}
                            disabled={extLoading}
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Unload</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>

                {/* Expanded config panel */}
                {isExpanded && ConfigPanel && enabled && (
                  <div className="border-t border-zinc-700/50 px-4 py-3 bg-zinc-800/30">
                    <ConfigPanel />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {allExtensions.length === 0 && (
          <div className="px-3 py-8 text-center text-ui-base text-zinc-600">
            No extensions installed
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
