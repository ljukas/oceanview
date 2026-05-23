import { devLog } from './adapters/devLog'
import { vercelQueue } from './adapters/vercelQueue'

/**
 * Background-job queue interface. Producers (oRPC procedures) call
 * `publish('<topic>', payload)` after the synchronous service call lands.
 * The Nitro Vercel preset routes inbound messages to the `vercel:queue`
 * hook (see `server/plugins/blurhashQueue.ts`).
 *
 * `topic` is typed as a string union of currently-used topics — extend
 * the union when adding new background jobs. The adapter selector picks
 * `vercelQueue` when running on Vercel and `devLog` otherwise (so unit
 * tests and `pnpm dev` succeed without contacting the queue service).
 */
export type QueueTopic = 'blurhash'

export type QueuePayloadMap = {
  blurhash: { fileId: string }
}

export interface QueueEffects {
  publish<T extends QueueTopic>(topic: T, payload: QueuePayloadMap[T]): Promise<void>
}

function pickAdapter(): QueueEffects {
  if (process.env.VITEST === 'true') return devLog
  if (!process.env.VERCEL) return devLog
  return vercelQueue
}

export const queue: QueueEffects = pickAdapter()
