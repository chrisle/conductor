import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSidebarStore } from '../store/sidebar'

function resetStore() {
  useSidebarStore.setState({
    width: 240,
    isVisible: true,
    rootPath: null,
    expandedPaths: new Set(),
    favorites: []
  })
}

describe('useSidebarStore', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  describe('setWidth', () => {
    it('sets width within bounds', () => {
      useSidebarStore.getState().setWidth(300)
      expect(useSidebarStore.getState().width).toBe(300)
    })

    it('clamps to minimum of 220', () => {
      useSidebarStore.getState().setWidth(50)
      expect(useSidebarStore.getState().width).toBe(220)
    })

    it('clamps to maximum of 600', () => {
      useSidebarStore.getState().setWidth(800)
      expect(useSidebarStore.getState().width).toBe(600)
    })
  })

  describe('toggleVisibility', () => {
    it('toggles from visible to hidden', () => {
      useSidebarStore.getState().toggleVisibility()
      expect(useSidebarStore.getState().isVisible).toBe(false)
    })

    it('toggles back to visible', () => {
      useSidebarStore.getState().toggleVisibility()
      useSidebarStore.getState().toggleVisibility()
      expect(useSidebarStore.getState().isVisible).toBe(true)
    })
  })

  describe('setRootPath', () => {
    it('sets the root path', () => {
      useSidebarStore.getState().setRootPath('/home/user/project')
      expect(useSidebarStore.getState().rootPath).toBe('/home/user/project')
    })
  })

  describe('expandedPaths', () => {
    it('toggleExpanded adds a path', () => {
      useSidebarStore.getState().toggleExpanded('/src')
      expect(useSidebarStore.getState().isExpanded('/src')).toBe(true)
    })

    it('toggleExpanded removes an already-expanded path', () => {
      useSidebarStore.getState().toggleExpanded('/src')
      useSidebarStore.getState().toggleExpanded('/src')
      expect(useSidebarStore.getState().isExpanded('/src')).toBe(false)
    })

    it('collapseAll clears all expanded paths', () => {
      useSidebarStore.getState().toggleExpanded('/src')
      useSidebarStore.getState().toggleExpanded('/lib')
      useSidebarStore.getState().collapseAll()
      expect(useSidebarStore.getState().isExpanded('/src')).toBe(false)
      expect(useSidebarStore.getState().isExpanded('/lib')).toBe(false)
    })
  })

  describe('favorites', () => {
    it('addFavorite adds a path and calls saveFavorites', () => {
      useSidebarStore.getState().addFavorite('/projects/cool')
      expect(useSidebarStore.getState().isFavorite('/projects/cool')).toBe(true)
      expect(window.electronAPI.saveFavorites).toHaveBeenCalledWith(['/projects/cool'])
    })

    it('addFavorite does not duplicate', () => {
      useSidebarStore.getState().addFavorite('/projects/cool')
      useSidebarStore.getState().addFavorite('/projects/cool')
      expect(useSidebarStore.getState().favorites).toEqual(['/projects/cool'])
    })

    it('removeFavorite removes a path and calls saveFavorites', () => {
      useSidebarStore.getState().addFavorite('/a')
      useSidebarStore.getState().addFavorite('/b')
      useSidebarStore.getState().removeFavorite('/a')
      expect(useSidebarStore.getState().favorites).toEqual(['/b'])
      expect(window.electronAPI.saveFavorites).toHaveBeenLastCalledWith(['/b'])
    })

    it('isFavorite returns false for non-favorite', () => {
      expect(useSidebarStore.getState().isFavorite('/nope')).toBe(false)
    })
  })
})
