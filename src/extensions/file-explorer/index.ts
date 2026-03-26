import { FolderOpen, FileText, BookOpen, FileSpreadsheet } from 'lucide-react'
import type { Extension } from '../types'
import FileExplorerSidebar from './FileExplorerSidebar'
import TextTab from './TextTab'
import MarkdownTab from './MarkdownTab'
import WordTab from './WordTab'
import ExcelTab from './ExcelTab'

export const fileExplorerExtension: Extension = {
  id: 'file-explorer',
  name: 'Explorer',
  description: 'Browse and edit project files',
  version: '1.0.0',
  icon: FolderOpen,
  sidebar: FileExplorerSidebar,
  tabs: [
    {
      type: 'text',
      label: 'Text Editor',
      icon: FileText,
      component: TextTab,
      fileExtensions: [
        '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
        '.py', '.rs', '.go', '.java', '.c', '.cpp', '.cs', '.php', '.rb', '.swift', '.kt',
        '.html', '.css', '.scss', '.less',
        '.json', '.jsonc', '.yaml', '.yml', '.toml', '.xml',
        '.sh', '.bash', '.zsh', '.sql', '.txt',
        '.vue', '.svelte', '.astro',
        '.env', '.gitignore', '.editorconfig'
      ]
    },
    {
      type: 'markdown',
      label: 'Markdown',
      icon: BookOpen,
      component: MarkdownTab,
      fileExtensions: ['.md', '.mdx']
    },
    {
      type: 'word',
      label: 'Word Document',
      icon: FileText,
      component: WordTab,
      fileExtensions: ['.docx', '.doc']
    },
    {
      type: 'excel',
      label: 'Spreadsheet',
      icon: FileSpreadsheet,
      component: ExcelTab,
      fileExtensions: ['.xlsx', '.xls', '.csv']
    }
  ]
}
