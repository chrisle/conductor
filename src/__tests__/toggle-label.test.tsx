import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Toggle from '../extensions/ai-cli/components/Toggle'

describe('Toggle', () => {
  it('renders the provided label text', () => {
    render(<Toggle on={false} onToggle={() => {}} label="Auto Pilot" />)
    expect(screen.getByText('Auto Pilot')).toBeTruthy()
  })

  it('does not render the old "Fuck it" label', () => {
    render(<Toggle on={false} onToggle={() => {}} label="Auto Pilot" />)
    expect(screen.queryByText('Fuck it')).toBeNull()
  })
})
