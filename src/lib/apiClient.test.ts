// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './apiClient'
import { isLoading, subscribeLoading } from './loadingState'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('apiRequest quiet flag', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('non-quiet requests drive the global loader; quiet requests never do', async () => {
    vi.useFakeTimers()

    // Controllable in-flight request so we can assert the loader state while
    // the request is unresolved.
    let resolveFetch: (r: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve })),
    )

    const seen: boolean[] = []
    subscribeLoading((v) => seen.push(v))

    // Non-quiet: the loader becomes visible after the 300ms debounce.
    const p = apiRequest('/api/trips/x', { auth: false })
    await vi.advanceTimersByTimeAsync(400)
    expect(isLoading()).toBe(true)
    resolveFetch(jsonResponse({ success: true, data: { id: 'x' } }))
    await p
    expect(isLoading()).toBe(false)

    // Quiet: while in flight it must never schedule the loader.
    const seenBefore = seen.length
    const q = apiRequest('/api/trips/x', { auth: false, quiet: true })
    await vi.advanceTimersByTimeAsync(400)
    expect(isLoading()).toBe(false)
    expect(seen.length).toBe(seenBefore)
    resolveFetch(jsonResponse({ success: true, data: { id: 'x' } }))
    await q
    expect(isLoading()).toBe(false)
  })
})