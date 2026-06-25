import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { ActiveStrategyCard } from '@/components/scout/ActiveStrategyCard'
import type { ScoutActiveStrategy } from '@/hooks/useScoutChat'

const STRATEGY: ScoutActiveStrategy = {
  id: 'abc',
  goal: 'Land an SWE internship at Stripe',
  steps: [
    { title: 'Loop targeting Stripe engineers', done: true },
    { title: 'Coffee chat with USC alumni at Stripe', done: false },
    { title: 'Apply to Stripe summer internship listing', done: false },
  ],
}

describe('ActiveStrategyCard', () => {
  it('renders goal and progress count', () => {
    render(<ActiveStrategyCard strategy={STRATEGY} />)
    expect(screen.getByTestId('active-strategy-card')).toBeInTheDocument()
    expect(screen.getByText(STRATEGY.goal)).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })

  it('renders each step with the correct checkbox state', () => {
    render(<ActiveStrategyCard strategy={STRATEGY} />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(3)
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()
    expect(checkboxes[2]).not.toBeChecked()
  })

  it('collapses step list when the header is clicked', () => {
    render(<ActiveStrategyCard strategy={STRATEGY} />)
    // Steps visible by default.
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    // Click the expand/collapse toggle.
    fireEvent.click(screen.getByLabelText(/collapse strategy/i))
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('fires onDontSave when the X button is clicked', () => {
    const onDontSave = vi.fn()
    render(<ActiveStrategyCard strategy={STRATEGY} onDontSave={onDontSave} />)
    fireEvent.click(screen.getByLabelText("Don't save this briefing as a plan"))
    expect(onDontSave).toHaveBeenCalledOnce()
  })

  it('omits the opt-out button when onDontSave is not provided', () => {
    render(<ActiveStrategyCard strategy={STRATEGY} />)
    expect(screen.queryByLabelText("Don't save this briefing as a plan")).toBeNull()
  })

  it('falls back to a default label when goal is empty', () => {
    render(
      <ActiveStrategyCard
        strategy={{ id: 'x', goal: '', steps: [] }}
      />,
    )
    expect(screen.getByText('Active strategy')).toBeInTheDocument()
  })
})
