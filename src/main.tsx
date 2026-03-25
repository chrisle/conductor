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

// Configure Monaco web workers for language services (JSON, CSS, HTML, TypeScript)
;(window as any).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    const getWorkerModule = (moduleUrl: string) =>
      new Worker(new URL(`monaco-editor/esm/vs/${moduleUrl}`, import.meta.url), { type: 'module' })
    if (label === 'json') return getWorkerModule('language/json/json.worker')
    if (label === 'css' || label === 'scss' || label === 'less') return getWorkerModule('language/css/css.worker')
    if (label === 'html' || label === 'handlebars' || label === 'razor') return getWorkerModule('language/html/html.worker')
    if (label === 'typescript' || label === 'javascript') return getWorkerModule('language/typescript/ts.worker')
    return getWorkerModule('editor/editor.worker')
  }
}

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
