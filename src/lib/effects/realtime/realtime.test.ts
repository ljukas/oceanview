import { describe, expect, test } from 'vitest'
import type { Logger } from '~/lib/logger'
import { createInMemoryRealtime } from './adapters/inMemory'
import type { RealtimeEvent } from './types'

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
}

async function collect(
  iter: AsyncIterable<RealtimeEvent>,
  count: number,
): Promise<RealtimeEvent[]> {
  const out: RealtimeEvent[] = []
  for await (const event of iter) {
    out.push(event)
    if (out.length >= count) break
  }
  return out
}

describe('inMemory realtime adapter', () => {
  test('publish delivers events to a subscriber', async () => {
    const realtime = createInMemoryRealtime()
    const ctrl = new AbortController()
    const received = collect(realtime.subscribe({ signal: ctrl.signal, log: noopLogger }), 2)

    // Yield a microtask so the subscriber's async generator can install its
    // listener before we publish — EventPublisher only buffers after subscribe.
    await Promise.resolve()
    await realtime.publish({ kind: 'user.changed', ids: ['a'] })
    await realtime.publish({ kind: 'user.changed', ids: ['b'] })

    const events = await received
    expect(events).toEqual([
      { kind: 'user.changed', ids: ['a'] },
      { kind: 'user.changed', ids: ['b'] },
    ])
    ctrl.abort()
  })

  test('multiple subscribers each receive every event', async () => {
    const realtime = createInMemoryRealtime()
    const a = new AbortController()
    const b = new AbortController()

    const recA = collect(realtime.subscribe({ signal: a.signal, log: noopLogger }), 1)
    const recB = collect(realtime.subscribe({ signal: b.signal, log: noopLogger }), 1)

    await Promise.resolve()
    await realtime.publish({ kind: 'user.changed', ids: ['shared'] })

    expect(await recA).toEqual([{ kind: 'user.changed', ids: ['shared'] }])
    expect(await recB).toEqual([{ kind: 'user.changed', ids: ['shared'] }])
    a.abort()
    b.abort()
  })

  test('signal.abort ends the iterator', async () => {
    const realtime = createInMemoryRealtime()
    const ctrl = new AbortController()
    const iter = realtime.subscribe({ signal: ctrl.signal, log: noopLogger })

    const done = (async () => {
      // Consume until the iterator finishes naturally on abort.
      const events: RealtimeEvent[] = []
      try {
        for await (const event of iter) events.push(event)
      } catch {
        // EventPublisher's iterator throws AbortError on signal — that also
        // counts as a clean teardown.
      }
      return events
    })()

    await Promise.resolve()
    ctrl.abort()

    // The promise should settle promptly; if abort doesn't tear down we'd hang.
    await expect(
      Promise.race([done, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 500))]),
    ).resolves.toEqual([])
  })
})
