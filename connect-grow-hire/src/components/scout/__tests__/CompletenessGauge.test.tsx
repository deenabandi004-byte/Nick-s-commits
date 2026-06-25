import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { CompletenessGauge } from '@/components/scout/CompletenessGauge'

function wrap(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

describe('CompletenessGauge', () => {
  it('renders the coverage percent button when below the hide threshold', () => {
    const { container } = render(
      wrap(
        <CompletenessGauge
          coverage={{
            coverage_pct: 60,
            present_groups: ['resume', 'goals'],
            gap_groups: ['linkedin', 'academics'],
            has_critical_gap: true,
            should_hide_gauge: false,
            should_pivot_briefing: false,
          }}
        />,
      ),
    )
    expect(screen.getByTestId('completeness-gauge')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /60 percent/i })).toBeInTheDocument()
    // Progress component renders inline (aria-label cross-checks the percent).
    expect(container.querySelector('[aria-label="Profile completeness: 60 percent"]')).not.toBeNull()
  })

  it('renders nothing when should_hide_gauge is true', () => {
    const { container } = render(
      wrap(
        <CompletenessGauge
          coverage={{
            coverage_pct: 95,
            present_groups: ['resume', 'linkedin', 'goals'],
            gap_groups: [],
            has_critical_gap: false,
            should_hide_gauge: true,
            should_pivot_briefing: false,
          }}
        />,
      ),
    )
    expect(container.firstChild).toBeNull()
  })

  it('clamps coverage_pct into the 0-100 range', () => {
    // A backend bug or bad payload could pass an out-of-range number; the
    // gauge clamps so the Progress component is never fed something silly.
    render(
      wrap(
        <CompletenessGauge
          coverage={{
            coverage_pct: 175,
            present_groups: [],
            gap_groups: [],
            has_critical_gap: false,
            should_hide_gauge: false,
            should_pivot_briefing: false,
          }}
        />,
      ),
    )
    expect(screen.getByRole('button', { name: /100 percent/i })).toBeInTheDocument()
  })
})
