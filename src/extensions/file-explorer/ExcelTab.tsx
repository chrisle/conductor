import React, { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { Skeleton } from '@/components/ui/skeleton'
import type { TabProps } from '@/extensions/types'

interface SheetData {
  name: string
  headers: string[]
  rows: string[][]
}

export default function ExcelTab({ tabId, groupId, isActive, tab }: TabProps): React.ReactElement {
  const filePath = tab.filePath
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (filePath) loadFile()
  }, [filePath])

  async function loadFile() {
    if (!filePath) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.readFileBinary(filePath)
      if (result.success && result.data) {
        const data = new Uint8Array(result.data)
        const workbook = XLSX.read(data, { type: 'array' })
        const parsed: SheetData[] = workbook.SheetNames.map(name => {
          const sheet = workbook.Sheets[name]
          const json = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
          const headers = (json[0] || []).map(String)
          const rows = json.slice(1).map(row => row.map(String))
          return { name, headers, rows }
        })
        setSheets(parsed)
        setActiveSheet(0)
      } else {
        setError(result.error || 'Failed to load file')
      }
    } catch (err) {
      setError(`Error loading file: ${String(err)}`)
    }
    setIsLoading(false)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full w-full">
        <div className="flex-1 overflow-hidden p-0">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="bg-zinc-800 px-3 py-1.5 border-r border-b border-zinc-700 w-12"><Skeleton className="h-3 w-4" /></th>
                {[...Array(5)].map((_, i) => (
                  <th key={i} className="bg-zinc-800 px-3 py-1.5 border-r border-b border-zinc-700"><Skeleton className="h-3 w-16" /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(8)].map((_, ri) => (
                <tr key={ri}>
                  <td className="bg-zinc-900/50 px-3 py-1.5 border-r border-b border-zinc-800/50"><Skeleton className="h-3 w-4" /></td>
                  {[...Array(5)].map((_, ci) => (
                    <td key={ci} className="px-3 py-1.5 border-r border-b border-zinc-800/50">
                      <Skeleton className="h-3" style={{ width: `${40 + ((ri * 3 + ci * 7) % 40)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

  if (sheets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        No data
      </div>
    )
  }

  const sheet = sheets[activeSheet]

  return (
    <div className="flex flex-col h-full w-full">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex items-center gap-0 border-b border-zinc-800 bg-zinc-900 shrink-0 overflow-x-auto">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setActiveSheet(i)}
              className={`px-3 py-1.5 text-xs border-r border-zinc-800 transition-colors ${
                i === activeSheet
                  ? 'bg-zinc-950 text-zinc-100 border-b-2 border-b-green-500'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="bg-zinc-800 text-zinc-500 px-3 py-1.5 text-right border-r border-b border-zinc-700 w-12 font-normal">
                #
              </th>
              {sheet.headers.map((h, i) => (
                <th
                  key={i}
                  className="bg-zinc-800 text-zinc-200 px-3 py-1.5 text-left border-r border-b border-zinc-700 font-medium whitespace-nowrap"
                >
                  {h || ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-zinc-900/50">
                <td className="bg-zinc-900/50 text-zinc-600 px-3 py-1 text-right border-r border-b border-zinc-800/50 font-mono">
                  {ri + 1}
                </td>
                {sheet.headers.map((_, ci) => (
                  <td
                    key={ci}
                    className="text-zinc-300 px-3 py-1 border-r border-b border-zinc-800/50 whitespace-nowrap"
                  >
                    {row[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
