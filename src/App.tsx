import React, { useEffect, useCallback } from 'react'
import TitleBar from './components/TitleBar'
import MainLayout from './components/Layout'
import Footer from './components/Footer'
import GoToDialog from './components/GoToDialog'

import { useSidebarStore } from './store/sidebar'
import { useTabsStore } from './store/tabs'
import { useLayoutStore } from './store/layout'
import { useProjectStore } from './store/project'
import { useUIStore } from './store/ui'
import { useConfigStore } from './store/config'
import { useWorkSessionsStore } from './store/work-sessions'
import { initializeDefaultProject, saveProject, autosaveLayout } from './lib/project-io'

function App(): React.ReactElement {
  const zoom = useUIStore(s => s.zoom)
  const goToOpen = useUIStore(s => s.goToOpen)
  const setGoToOpen = useUIStore(s => s.setGoToOpen)

  // Initialize config and work sessions stores
  useEffect(() => {
    useConfigStore.getState().initialize()
    useWorkSessionsStore.getState().initialize()
  }, [])

  // Load persisted favorites from disk on startup
  useEffect(() => {
    window.electronAPI.loadFavorites().then((favs: string[]) => {
      if (favs.length > 0) {
        useSidebarStore.setState({ favorites: favs })
      }
    })
  }, [])

  // Initialize default project if none is loaded
  useEffect(() => {
    initializeDefaultProject()
  }, [])

  // Auto-save when tabs or layout change (debounced)
  useEffect(() => {
    let initialized = false
    let saveTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleAutoSave = () => {
      if (!initialized) return
      const { filePath } = useProjectStore.getState()
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        if (filePath) {
          saveProject(filePath).catch(() => {})
        } else {
          autosaveLayout()
        }
      }, 500)
    }

    const unsubTabs = useTabsStore.subscribe(scheduleAutoSave)
    const unsubLayout = useLayoutStore.subscribe(scheduleAutoSave)
    requestAnimationFrame(() => { initialized = true })
    return () => {
      unsubTabs()
      unsubLayout()
      if (saveTimer) clearTimeout(saveTimer)
    }
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const shortcuts = useConfigStore.getState().config.customization.keyboardShortcuts
    const getKeys = (id: string) => {
      const s = shortcuts.find(s => s.id === id)
      return s?.keys ?? ''
    }

    const matchesShortcut = (id: string): boolean => {
      const keys = getKeys(id)
      if (!keys) return false
      const parts = keys.split('+').map(p => p.trim().toLowerCase())
      const needsMeta = parts.includes('meta') || parts.includes('cmd')
      const needsCtrl = parts.includes('ctrl') || parts.includes('control')
      const needsShift = parts.includes('shift')
      const needsAlt = parts.includes('alt')
      const keyPart = parts.filter(p => !['meta', 'cmd', 'ctrl', 'control', 'shift', 'alt'].includes(p))[0] ?? ''

      if (needsMeta && !e.metaKey) return false
      if (needsCtrl && !e.ctrlKey) return false
      if (needsShift && !e.shiftKey) return false
      if (needsAlt && !e.altKey) return false
      if (!needsMeta && e.metaKey && keyPart !== '') return false
      if (!needsShift && e.shiftKey) return false

      return e.key.toLowerCase() === keyPart || e.key === keyPart
    }

    if (matchesShortcut('goToFile')) {
      e.preventDefault()
      setGoToOpen(!useUIStore.getState().goToOpen)
      return
    }

    if (matchesShortcut('nextTab') || matchesShortcut('prevTab')) {
      e.preventDefault()
      const groupId = useLayoutStore.getState().focusedGroupId
      if (!groupId) return
      const group = useTabsStore.getState().groups[groupId]
      if (!group || group.tabs.length < 2) return
      const idx = group.tabs.findIndex(t => t.id === group.activeTabId)
      const delta = matchesShortcut('prevTab') ? -1 : 1
      const next = (idx + delta + group.tabs.length) % group.tabs.length
      useTabsStore.getState().setActiveTab(groupId, group.tabs[next].id)
      return
    }

    if (matchesShortcut('zoomIn')) {
      e.preventDefault()
      useUIStore.getState().zoomIn()
      return
    }
    if (matchesShortcut('zoomOut')) {
      e.preventDefault()
      useUIStore.getState().zoomOut()
      return
    }
    if (matchesShortcut('zoomReset')) {
      e.preventDefault()
      useUIStore.getState().resetZoom()
      return
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      className="flex flex-col h-full w-full bg-zinc-950 overflow-hidden"
      style={{
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        width: `${100 / zoom}%`,
        height: `${100 / zoom}%`,
      }}
    >
      <TitleBar />
      <div className="flex-1 overflow-hidden">
        <MainLayout />
      </div>
      <Footer />
      <GoToDialog open={goToOpen} onOpenChange={setGoToOpen} />
    </div>
  )
}

export default App
