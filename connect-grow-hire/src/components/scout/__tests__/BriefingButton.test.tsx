import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { BriefingButton } from '@/components/scout/BriefingButton'

describe('BriefingButton', () => {
  it('renders the default label and is enabled', () => {
    render(<BriefingButton onClick={() => {}} isLoading={false} />)
    const btn = screen.getByTestId('briefing-button')
    expect(btn).toBeEnabled()
    expect(btn).toHaveTextContent('Set a plan')
  })

  it('shows the loading label and is disabled while isLoading is true', () => {
    render(<BriefingButton onClick={() => {}} isLoading={true} />)
    const btn = screen.getByTestId('briefing-button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveTextContent('Putting together your plan')
  })

  it('fires onClick when the user clicks', () => {
    const onClick = vi.fn()
    render(<BriefingButton onClick={onClick} isLoading={false} />)
    fireEvent.click(screen.getByTestId('briefing-button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does NOT fire onClick when isLoading - guards against duplicate requests', () => {
    const onClick = vi.fn()
    render(<BriefingButton onClick={onClick} isLoading={true} />)
    fireEvent.click(screen.getByTestId('briefing-button'))
    expect(onClick).not.toHaveBeenCalled()
  })
})
