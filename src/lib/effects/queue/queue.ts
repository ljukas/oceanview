/**
 * Background-job queue interface. Producers (oRPC procedures) call
 * `publish('<topic>', payload)` after the synchronous service call lands.
 * The Nitro Vercel preset routes inbound messages to the `vercel:queue`
 * hook (see `server/plugins/blurhashQueue.ts`).
 *
 * `topic` is typed as a string union of currently-used topics — extend
 * the union when adding new background jobs. Adapter selection happens on
 * first publish via dynamic import so each runtime only ships the adapter
 * it actually uses (BullMQ stays out of the prod Nitro bundle, etc.).
 */
export type QueueTopic = 'blurhash'

/**
 * Per-topic payload shape. The blurhash payload is a discriminated union
 * over `kind` so the consumer can dispatch downstream side effects (e.g.
 * mirroring onto `user.image_blurhash`) without introspecting the file row
 * — job semantics live in the message, not in storage layout.
 */
export type QueuePayloadMap = {
  blurhash:
    | { fileId: string; kind: 'avatar'; userId: string }
    | { fileId: string; kind: 'document' }
}

export interface QueueEffects {
  publish<T extends QueueTopic>(topic: T, payload: QueuePayloadMap[T]): Promise<void>
}

let cached: Promise<QueueEffects> | null = null

async function getAdapter(): Promise<QueueEffects> {
  if (cached) return cached
  cached = (async () => {
    if (process.env.VITEST === 'true') {
      return (await import('./adapters/devLog')).devLog
    }
    // Local dev: when REDIS_URL is set we route through BullMQ so a real
    // worker (`scripts/devBlurhashWorker.ts`) can consume the queue out of
    // band. Mirrors the prod topology in shape (durable broker, separate
    // consumer process, retries) without depending on a Vercel runtime.
    if (process.env.REDIS_URL) {
      return (await import('./adapters/bullmqQueue')).bullmqQueue
    }
    if (!process.env.VERCEL) {
      return (await import('./adapters/devLog')).devLog
    }
    return (await import('./adapters/vercelQueue')).vercelQueue
  })()
  return cached
}

export const queue: QueueEffects = {
  async publish(topic, payload) {
    const adapter = await getAdapter()
    await adapter.publish(topic, payload)
  },
}
