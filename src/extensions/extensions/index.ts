import { Puzzle } from 'lucide-react'
import type { Extension } from '../types'
import ExtensionsSidebar from './ExtensionsSidebar'

export const extensionsManagerExtension: Extension = {
  id: 'extensions',
  name: 'Extensions',
  icon: Puzzle,
  sidebar: ExtensionsSidebar
}
