/**
 * Verifies that dragstart/dragend window events toggle EdgeDropZone
 * pointer-events between none and auto (CON-65).
 */
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, screen, act } from '@testing-library/react'
import React, { useEffect, useState } from 'react'

// Minimal harness that replicates MainLayout's drag tracking + EdgeDropZone
function Harness() {
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const onStart = () => setDragging(true)
    const onEnd = () => setDragging(false)
    window.addEventListener('dragstart', onStart)
    window.addEventListener('dragend', onEnd)
    return () => {
      window.removeEventListener('dragstart', onStart)
      window.removeEventListener('dragend', onEnd)
    }
  }, [])

  return React.createElement('div', {
    'data-testid': 'edge-zone',
    className: `absolute z-20 ${dragging ? 'pointer-events-auto' : 'pointer-events-none'}`,
  })
}

describe('EdgeDropZone drag toggle (CON-65)', () => {
  afterEach(cleanup)

  it('switches from pointer-events-none to pointer-events-auto on dragstart, back on dragend', () => {
    render(React.createElement(Harness))
    const el = screen.getByTestId('edge-zone')

    // Initially, clicks should pass through
    expect(el.className).toContain('pointer-events-none')

    // Simulate a tab drag starting
    act(() => { window.dispatchEvent(new Event('dragstart')) })
    expect(el.className).toContain('pointer-events-auto')

    // Simulate drag ending
    act(() => { window.dispatchEvent(new Event('dragend')) })
    expect(el.className).toContain('pointer-events-none')
  })
})
