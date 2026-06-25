/**
 * Frontend test infrastructure smoke test (Phase 4A).
 *
 * Verifies that:
 *   - Vitest is wired up (the `test` script in package.json runs this file)
 *   - jsdom + @testing-library/react render a React component
 *   - @testing-library/jest-dom matchers are loaded (toBeInTheDocument)
 *   - The "@" alias resolves
 *
 * If this file fails after a Vite or test-config change, ALL frontend tests
 * are broken; fix here before chasing component-level failures.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { cn } from '@/lib/utils'

function HelloWorld({ name }: { name: string }) {
  return <p data-testid="hello">Hello, {name}</p>
}

describe('frontend test infrastructure', () => {
  it('renders a React component into jsdom', () => {
    render(<HelloWorld name="Scout" />)
    expect(screen.getByTestId('hello')).toBeInTheDocument()
    expect(screen.getByText('Hello, Scout')).toBeInTheDocument()
  })

  it('resolves the @ alias to src/', () => {
    // If the alias is broken, the import above would fail at module load
    // (this assertion only runs if it succeeded).
    expect(cn('foo', 'bar')).toContain('foo')
  })
})
