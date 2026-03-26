import { Puzzle } from 'lucide-react'
import type { Extension } from '../types'
import ExtensionsSidebar from './ExtensionsSidebar'

export const extensionsManagerExtension: Extension = {
  id: 'extensions',
  name: 'Extensions',
  description: 'Install and manage extensions',
  version: '1.0.0',
  icon: Puzzle,
  sidebar: ExtensionsSidebar
}
