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

// Configure Monaco web workers for language services (JSON, CSS, HTML, TypeScript)
// Uses ?worker import for Vite compatibility in both dev and production builds
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

;(window as any).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
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
