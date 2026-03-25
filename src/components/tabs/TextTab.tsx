import React, { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useTabsStore } from '@/store/tabs'

interface TextTabProps {
  tabId: string
  groupId: string
  filePath?: string
  isActive: boolean
}

function getLanguage(filePath?: string): string {
  if (!filePath) return 'plaintext'
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
    cs: 'csharp', php: 'php', rb: 'ruby', swift: 'swift', kt: 'kotlin',
    html: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', sh: 'shell', bash: 'shell', zsh: 'shell',
    sql: 'sql', graphql: 'graphql', gql: 'graphql',
    vue: 'html', svelte: 'html'
  }
  return map[ext] || 'plaintext'
}

export default function TextTab({ tabId, groupId, filePath, isActive }: TextTabProps): React.ReactElement {
  const [content, setContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { updateTab } = useTabsStore()

  useEffect(() => {
    if (filePath) {
      loadFile()
    }
  }, [filePath])

  async function loadFile() {
    if (!filePath) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.readFile(filePath)
      if (result.success) {
        setContent(result.content || '')
      } else {
        setError(result.error || 'Failed to load file')
      }
    } catch (err) {
      setError(`Error loading file: ${String(err)}`)
    }
    setIsLoading(false)
  }

  function handleChange(value: string | undefined) {
    const newContent = value || ''
    setContent(newContent)
    updateTab(groupId, tabId, { isDirty: true, content: newContent })
  }

  async function handleSave() {
    if (!filePath || !content) return
    const result = await window.electronAPI.writeFile(filePath, content)
    if (result.success) {
      updateTab(groupId, tabId, { isDirty: false })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm p-4">
        {error}
      </div>
    )
  }

  return (
    <div className="h-full w-full" onKeyDown={e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }}>
      <Editor
        height="100%"
        language={getLanguage(filePath)}
        value={content}
        onChange={handleChange}
        theme="vs-dark"
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
          fontLigatures: true,
          lineHeight: 1.6,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderWhitespace: 'selection',
          tabSize: 2,
          wordWrap: 'on',
          padding: { top: 12, bottom: 12 },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          renderLineHighlight: 'line',
          lineNumbers: 'on',
          glyphMargin: false,
          folding: true,
          overviewRulerBorder: false,
          scrollbar: {
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6
          }
        }}
      />
    </div>
  )
}
