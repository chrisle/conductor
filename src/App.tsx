import React, { useState, useEffect, useCallback } from 'react'
import TitleBar from './components/TitleBar'
import MainLayout from './components/Layout'
import Footer from './components/Footer'
import GoToDialog from './components/GoToDialog'
import { useSidebarStore } from './store/sidebar'
import { useTabsStore } from './store/tabs'
import { useLayoutStore } from './store/layout'
import { useProjectStore } from './store/project'
import { initializeDefaultProject } from './lib/project-io'

function App(): React.ReactElement {
  const [goToOpen, setGoToOpen] = useState(false)

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

  // Mark workspace dirty when tabs or layout change
  useEffect(() => {
    let initialized = false
    // Skip the first state (initial setup)
    const unsubTabs = useTabsStore.subscribe(() => {
      if (!initialized) return
      useProjectStore.getState().markWorkspaceDirty()
    })
    const unsubLayout = useLayoutStore.subscribe(() => {
      if (!initialized) return
      useProjectStore.getState().markWorkspaceDirty()
    })
    // Delay enabling to avoid marking dirty during initial setup
    requestAnimationFrame(() => { initialized = true })
    return () => { unsubTabs(); unsubLayout() }
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ctrl+G or Cmd+G
    if (e.key === 'g' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      setGoToOpen(prev => !prev)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 overflow-hidden">
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
