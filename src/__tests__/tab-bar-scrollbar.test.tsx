import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock the stores and dependencies used by TabGroup
vi.mock('../stores/tabs-store', () => ({
  useTabsStore: Object.assign(vi.fn(() => ({
    groups: {},
    focusedGroupId: null,
  })), {
    getState: vi.fn(() => ({
      groups: {},
      focusedGroupId: null,
      selectTabRange: vi.fn(),
      toggleSelectTab: vi.fn(),
      clearSelection: vi.fn(),
    })),
    setState: vi.fn(),
    subscribe: vi.fn(),
  }),
}))

vi.mock('../stores/ui-store', () => ({
  useUIStore: Object.assign(vi.fn(() => ({
    activityBar: { visible: true },
  })), {
    getState: vi.fn(() => ({
      activityBar: { visible: true },
    })),
    subscribe: vi.fn(),
  }),
}))

describe('Tab bar scrollbar visibility', () => {
  afterEach(() => {
    cleanup()
  })

  it('scrollbar-hide class is defined in the global styles', () => {
    // Verify the CSS class exists in index.css
    // We test this by checking the stylesheet content
    const fs = require('fs')
    const path = require('path')
    const css = fs.readFileSync(
      path.resolve(__dirname, '../index.css'),
      'utf-8',
    )

    // The scrollbar-hide class should hide the webkit scrollbar
    expect(css).toContain('.scrollbar-hide::-webkit-scrollbar')
    expect(css).toContain('display: none')
    // Should also handle Firefox
    expect(css).toContain('scrollbar-width: none')
    // Should also handle IE/Edge
    expect(css).toContain('-ms-overflow-style: none')
  })

  it('tab bar scroll container has scrollbar-hide class in TabGroup', () => {
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../components/Layout/TabGroup.tsx'),
      'utf-8',
    )

    // The scroll container should have both overflow-x-auto (for functionality)
    // and scrollbar-hide (to prevent the scrollbar from displacing tabs)
    expect(source).toContain('overflow-x-auto scrollbar-hide')
  })
})
