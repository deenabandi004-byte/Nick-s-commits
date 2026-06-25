/**
 * Tests for useScoutChat.requestBriefing (Phase 4B groundwork).
 *
 * Pins the contract the "Get my game plan" button and auto-fire trigger
 * depend on:
 *   - posts to /api/scout-assistant/briefing/stream with Bearer auth
 *   - payload carries the user tier so the backend strategist prompt cites
 *     the correct contact-per-search cap
 *   - streams `token` SSE events into the assistant message
 *   - terminates on `done` and exposes the full message
 *   - handles error events without crashing
 *
 * Mocks the Firebase auth + FirebaseAuthContext so the hook can run inside
 * a test renderer without the real Firebase SDK. Mocks global fetch so the
 * SSE response is deterministic.
 */
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { useScoutChat } from '@/hooks/useScoutChat'

// Mock Firebase auth: getToken pulls auth.currentUser.getIdToken().
vi.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn(async () => 'fake-test-token'),
    },
  },
}))

// Mock the auth context so the hook gets a stable user shape.
vi.mock('@/contexts/FirebaseAuthContext', () => ({
  useFirebaseAuth: () => ({
    user: { name: 'Sid', tier: 'pro', credits: 2400, maxCredits: 3000 },
    firebaseUser: { uid: 'test-uid' },
  }),
}))

// scoutChats service makes real fetches; stub the bits the hook touches at
// mount so component init doesn't blow up.
vi.mock('@/services/scoutChats', () => ({
  getScoutChat: vi.fn(async () => null),
  type: undefined,
}))

vi.mock('@/services/scoutConversations', () => ({
  clearActiveThread: vi.fn(),
}))

/**
 * Build a ReadableStream that emits the given SSE frames in order.
 * Real backends interleave heartbeat + token + done; tests pass frames
 * verbatim so each event type can be exercised cleanly.
 */
function streamFromFrames(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i >= frames.length) {
        controller.close()
        return
      }
      // Each frame is one SSE event terminated by a blank line.
      controller.enqueue(encoder.encode(frames[i] + '\n\n'))
      i++
    },
  })
}

function sseFrame(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}`
}

// Test harness component: exposes the hook's API via window so test code can
// call requestBriefing imperatively without rebuilding a UI for it.
declare global {
  // eslint-disable-next-line no-var
  var __scoutHook: ReturnType<typeof useScoutChat> | undefined
}

function Harness() {
  const api = useScoutChat()
  globalThis.__scoutHook = api
  return <div data-testid="harness" />
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.__scoutHook = undefined
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.clearAllMocks()
})

describe('useScoutChat.requestBriefing', () => {
  it('posts to /briefing/stream with Bearer auth + tier in payload', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Response(streamFromFrames([sseFrame('done', { message: 'hi' })]), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    render(<MemoryRouter><Harness /></MemoryRouter>)
    await waitFor(() => expect(globalThis.__scoutHook).toBeDefined())

    await act(async () => {
      await globalThis.__scoutHook!.requestBriefing()
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/scout-assistant/briefing/stream')
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer fake-test-token')
    expect(headers['Content-Type']).toBe('application/json')
    // Tier is forwarded so the backend strategist prompt cites the right cap.
    const body = JSON.parse(init?.body as string)
    expect(body.user_info.tier).toBe('pro')
    expect(body.user_info.subscriptionTier).toBe('pro')
  })

  it('streams token events into a single assistant message and finishes on done', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        streamFromFrames([
          sseFrame('token', { text: 'Step 1: ' }),
          sseFrame('token', { text: 'set up a Loop' }),
          sseFrame('done', { message: 'Step 1: set up a Loop', coverage: { coverage_pct: 60 } }),
        ]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    render(<MemoryRouter><Harness /></MemoryRouter>)
    await waitFor(() => expect(globalThis.__scoutHook).toBeDefined())

    await act(async () => {
      const ok = await globalThis.__scoutHook!.requestBriefing()
      expect(ok).toBe(true)
    })

    const briefingMessage = globalThis.__scoutHook!.messages.find(
      m => m.id.startsWith('briefing-'),
    )
    expect(briefingMessage).toBeDefined()
    expect(briefingMessage!.content).toBe('Step 1: set up a Loop')
    expect(briefingMessage!.isStreaming).toBe(false)
    expect(briefingMessage!.role).toBe('assistant')
  })

  it('renders an error message when backend returns an error event', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      streamFromFrames([sseFrame('error', { message: 'Briefing failed - try again.' })]),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    )) as unknown as typeof fetch

    render(<MemoryRouter><Harness /></MemoryRouter>)
    await waitFor(() => expect(globalThis.__scoutHook).toBeDefined())

    await act(async () => {
      const ok = await globalThis.__scoutHook!.requestBriefing()
      expect(ok).toBe(true)  // a terminal event WAS received - just an error one
    })

    const msg = globalThis.__scoutHook!.messages.find(m => m.id.startsWith('briefing-'))
    expect(msg!.content).toBe('Briefing failed - try again.')
    expect(msg!.isStreaming).toBe(false)
  })

  it('shows a fallback message when fetch itself rejects (network down)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch

    render(<MemoryRouter><Harness /></MemoryRouter>)
    await waitFor(() => expect(globalThis.__scoutHook).toBeDefined())

    await act(async () => {
      const ok = await globalThis.__scoutHook!.requestBriefing()
      expect(ok).toBe(false)
    })

    const msg = globalThis.__scoutHook!.messages.find(m => m.id.startsWith('briefing-'))
    expect(msg!.content).toMatch(/couldn't reach/i)
    expect(msg!.isStreaming).toBe(false)
  })

  it('ignores heartbeat events while keeping the stream alive', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      streamFromFrames([
        sseFrame('heartbeat', {}),
        sseFrame('token', { text: 'after heartbeat' }),
        sseFrame('heartbeat', {}),
        sseFrame('done', { message: 'after heartbeat' }),
      ]),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    )) as unknown as typeof fetch

    render(<MemoryRouter><Harness /></MemoryRouter>)
    await waitFor(() => expect(globalThis.__scoutHook).toBeDefined())

    await act(async () => {
      await globalThis.__scoutHook!.requestBriefing()
    })

    const msg = globalThis.__scoutHook!.messages.find(m => m.id.startsWith('briefing-'))
    expect(msg!.content).toBe('after heartbeat')
  })
})
