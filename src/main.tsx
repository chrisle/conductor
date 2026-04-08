// In web-only mode (no Electron), install a stub electronAPI before anything else
if (!window.electronAPI) {
  const { installElectronAPIMock } = await import('./electron-api-mock')
  installElectronAPIMock()
}


import React from 'react'
import ReactDOM from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import App from './App'
import './index.css'
import { useTabsStore } from './store/tabs'
import { useLayoutStore } from './store/layout'
import { useSidebarStore } from './store/sidebar'
import { useProjectStore } from './store/project'
import { useActivityBarStore } from './store/activityBar'
import { useUIStore } from './store/ui'
import { useSettingsDialogStore } from './store/settingsDialog'
import { initializeExtensions, extensionRegistry } from './extensions'
import { mountConductorAPI } from './extensions/api'
import { loadExternalExtensions, loadExtension } from './extensions/loader'

// Use local monaco-editor bundle instead of CDN (required for Electron)
loader.config({ monaco })

// Configure Monaco web workers for language services (JSON, CSS, HTML, TypeScript).
// Workers are instantiated lazily on first request so they don't consume resources
// at startup when no editor tabs are open.
;(window as any).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') {
      return import('monaco-editor/esm/vs/language/json/json.worker?worker').then(m => new m.default())
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return import('monaco-editor/esm/vs/language/css/css.worker?worker').then(m => new m.default())
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return import('monaco-editor/esm/vs/language/html/html.worker?worker').then(m => new m.default())
    }
    if (label === 'typescript' || label === 'javascript') {
      return import('monaco-editor/esm/vs/language/typescript/ts.worker?worker').then(m => new m.default())
    }
    return import('monaco-editor/esm/vs/editor/editor.worker?worker').then(m => new m.default())
  }
}

// Initialize extension registry with built-in extensions
initializeExtensions()

// Mount host API for external extensions, then load them
mountConductorAPI()
loadExternalExtensions().catch(err => console.error('Failed to load external extensions:', err))

// Expose Zustand stores on window for E2E testing
;(window as any).__stores__ = {
  tabs: useTabsStore,
  layout: useLayoutStore,
  sidebar: useSidebarStore,
  project: useProjectStore,
  activityBar: useActivityBarStore,
  ui: useUIStore,
  settingsDialog: useSettingsDialogStore,
  extensionRegistry,
  loadExtension,
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
