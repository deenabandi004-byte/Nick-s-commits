/**
 * Tests for formatMessage's markdown-link rendering.
 *
 * The strategist briefing leans heavily on inline [text](url) links - they
 * are how every step's CTA lands in the chat bubble. If formatMessage stops
 * rendering them as styled chips, briefings regress to URL-encoded prose
 * blobs in the panel.
 */
import { describe, expect, it } from 'vitest'

import { formatMessage } from '@/hooks/useScoutChat'

describe('formatMessage', () => {
  it('renders a markdown link to an internal route as a styled chip with data-scout-link', () => {
    const out = formatMessage('[Start this Loop →](/agent/setup?mode=people)')
    expect(out).toContain('<a ')
    expect(out).toContain('href="/agent/setup?mode=people"')
    expect(out).toContain('data-scout-link="1"')
    expect(out).toContain('Start this Loop')
    // Styled as a chip (Tailwind classes).
    expect(out).toContain('rounded-full')
  })

  it('opens external https links in a new tab and does NOT mark them as scout-links', () => {
    const out = formatMessage('[Read more](https://stripe.com/careers)')
    expect(out).toContain('href="https://stripe.com/careers"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
    expect(out).not.toContain('data-scout-link')
  })

  it('un-escapes the & in internal links so query params survive', () => {
    // HTML escaping turns & into &amp; before the link replacer runs; the
    // formatter must restore the raw & inside the href so react-router can
    // parse the query string. Otherwise the user clicks "Start this Loop"
    // and lands on /agent/setup with no prefill.
    const out = formatMessage('[Start the Loop →](/agent/setup?mode=people&cadence=weekly)')
    expect(out).toContain('href="/agent/setup?mode=people&cadence=weekly"')
  })

  it('still HTML-escapes user content outside links', () => {
    const out = formatMessage('<script>alert(1)</script> [link](/x)')
    expect(out).toContain('&lt;script&gt;')
    expect(out).not.toContain('<script>')
  })

  it('renders **bold** inside the same message', () => {
    const out = formatMessage('**Try this:** [Start the Loop →](/agent/setup)')
    expect(out).toContain('<strong>Try this:</strong>')
    expect(out).toContain('Start the Loop')
  })

  it('converts newlines to <br />', () => {
    const out = formatMessage('line one\nline two')
    expect(out).toContain('line one<br />line two')
  })

  // The strategist prompt explicitly tells the LLM not to URL-encode briefs,
  // so Loop CTAs arrive with raw spaces in the query string. formatMessage
  // must still render those as chips, encoding the href on the way in.
  it('renders a Loop CTA whose href contains raw spaces as a chip', () => {
    const out = formatMessage(
      '[Start this Loop →](/agent/setup?brief=8 USC alumni at Stripe&mode=people)'
    )
    expect(out).toContain('<a ')
    expect(out).toContain('data-scout-link="1"')
    expect(out).toContain('rounded-full')
    expect(out).toContain(
      'href="/agent/setup?brief=8%20USC%20alumni%20at%20Stripe&mode=people"'
    )
    // The raw-text fallback must NOT survive — that's the regression we're guarding.
    expect(out).not.toContain('[Start this Loop')
  })
})
