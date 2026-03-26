import React, { useRef, useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, X, Globe } from 'lucide-react'
import { useTabsStore } from '@/store/tabs'
import type { TabProps } from '@/extensions/types'

// Injected CSS to add claude code bridge
const INJECT_CSS = `
/* Conductor browser injection */
`

// Injected JS to expose bridge
const INJECT_JS = `
(function() {
  if (window.__claudeCode) return;

  const listeners = [];

  window.__claudeCode = {
    sendMessage: function(data) {
      window.dispatchEvent(new CustomEvent('__claudeCode:send', { detail: data }));
    },
    onMessage: function(callback) {
      listeners.push(callback);
      window.addEventListener('__claudeCode:receive', function(e) {
        callback(e.detail);
      });
    }
  };

  console.log('[Conductor] Bridge injected');
})();
`

// Extended webview element type for Electron
type WebviewElement = HTMLElement & {
  src?: string
  canGoBack: () => boolean
  canGoForward: () => boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  stop: () => void
  getURL: () => string
  getTitle: () => string
  loadURL: (url: string) => Promise<void>
  insertCSS: (css: string) => Promise<void>
  executeJavaScript: (js: string) => Promise<unknown>
}

export default function BrowserTab({ tabId, groupId, isActive, tab }: TabProps): React.ReactElement {
  const initialUrl = tab.url
  const [url, setUrl] = useState(initialUrl || '')
  const [inputUrl, setInputUrl] = useState(initialUrl || '')
  const [isLoading, setIsLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const webviewRef = useRef<any>(null)
  const { updateTab } = useTabsStore()

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleLoadStart = () => setIsLoading(true)
    const handleLoadStop = () => {
      setIsLoading(false)
      const wv = webviewRef.current
      if (wv) {
        setCanGoBack(wv.canGoBack())
        setCanGoForward(wv.canGoForward())
        const currentUrl = wv.getURL()
        setInputUrl(currentUrl)
        setUrl(currentUrl)
        // Update tab title
        const title = wv.getTitle()
        if (title) {
          updateTab(groupId, tabId, { title: title.slice(0, 40) })
        }
      }
    }

    const handleDomReady = () => {
      const wv = webviewRef.current
      if (!wv) return
      // Inject CSS
      wv.insertCSS(INJECT_CSS).catch(() => {})
      // Inject JS bridge
      wv.executeJavaScript(INJECT_JS).catch(() => {})
    }

    const handleTitleUpdated = (e: any) => {
      updateTab(groupId, tabId, { title: (e.title || 'Browser').slice(0, 40) })
    }

    webview.addEventListener('did-start-loading', handleLoadStart)
    webview.addEventListener('did-stop-loading', handleLoadStop)
    webview.addEventListener('dom-ready', handleDomReady)
    webview.addEventListener('page-title-updated', handleTitleUpdated)

    return () => {
      webview.removeEventListener('did-start-loading', handleLoadStart)
      webview.removeEventListener('did-stop-loading', handleLoadStop)
      webview.removeEventListener('dom-ready', handleDomReady)
      webview.removeEventListener('page-title-updated', handleTitleUpdated)
    }
  }, [webviewRef.current])

  function normalizeUrl(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return 'about:blank'
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('about:')) {
      return trimmed
    }
    // If it looks like a domain
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(trimmed)) {
      return `https://${trimmed}`
    }
    // Search query
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
  }

  function navigate(rawUrl: string) {
    const normalized = normalizeUrl(rawUrl)
    setUrl(normalized)
    setInputUrl(normalized)
    if (webviewRef.current) {
      webviewRef.current.src = normalized
      webviewRef.current.loadURL(normalized).catch(() => {})
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    navigate(inputUrl)
  }

  function handleBack() {
    if (webviewRef.current?.canGoBack()) {
      webviewRef.current.goBack()
    }
  }

  function handleForward() {
    if (webviewRef.current?.canGoForward()) {
      webviewRef.current.goForward()
    }
  }

  function handleRefresh() {
    if (webviewRef.current) {
      if (isLoading) {
        webviewRef.current.stop()
      } else {
        webviewRef.current.reload()
      }
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950">
      {/* Browser toolbar */}
      <div className="flex items-center gap-1 px-2 h-9 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <button
          onClick={handleBack}
          disabled={!canGoBack}
          className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={handleForward}
          disabled={!canGoForward}
          className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={handleRefresh}
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {isLoading ? (
            <X className="w-4 h-4" />
          ) : (
            <RotateCw className="w-4 h-4" />
          )}
        </button>

        <form onSubmit={handleSubmit} className="flex-1 flex items-center">
          <div className="flex items-center flex-1 bg-zinc-800 border border-zinc-700 focus-within:border-zinc-500 transition-colors px-2 h-6 gap-1">
            <Globe className="w-3 h-3 text-zinc-500 shrink-0" />
            <input
              type="text"
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              className="flex-1 bg-transparent text-zinc-200 text-xs font-mono outline-none placeholder:text-zinc-600"
              placeholder="Enter URL or search..."
              onFocus={e => e.target.select()}
            />
          </div>
        </form>
      </div>

      {/* Webview */}
      <div className="flex-1 overflow-hidden">
        {React.createElement('webview', {
          ref: webviewRef,
          src: url || 'about:blank',
          className: 'w-full h-full',
          nodeintegration: 'false',
          webpreferences: 'contextIsolation=yes',
          allowpopups: 'false',
          style: { display: 'flex', width: '100%', height: '100%' }
        })}
      </div>
    </div>
  )
}
