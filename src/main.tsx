import React from 'react'
import ReactDOM from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import App from './App'
import './index.css'
import { useTabsStore } from './store/tabs'
import { useLayoutStore } from './store/layout'
import { useSidebarStore } from './store/sidebar'

// Use local monaco-editor bundle instead of CDN (required for Electron)
loader.config({ monaco })

// Expose Zustand stores on window for E2E testing
;(window as any).__stores__ = {
  tabs: useTabsStore,
  layout: useLayoutStore,
  sidebar: useSidebarStore
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
