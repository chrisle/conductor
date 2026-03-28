import React, { useState, useEffect, useCallback } from 'react'
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
  const [goToOpen, setGoToOpen] = useState(false)
  const zoom = useUIStore(s => s.zoom)

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
    // Ctrl+G or Cmd+G
    if (e.key === 'g' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      setGoToOpen(prev => !prev)
    }
    // Zoom: Cmd+= / Cmd+- / Cmd+0
    if (e.metaKey || e.ctrlKey) {
      if (e.key === '=' || e.key === '+') { e.preventDefault(); useUIStore.getState().zoomIn() }
      else if (e.key === '-') { e.preventDefault(); useUIStore.getState().zoomOut() }
      else if (e.key === '0') { e.preventDefault(); useUIStore.getState().resetZoom() }
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
