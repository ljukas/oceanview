import type { Logger } from '~/lib/logger'
import { inMemory } from './adapters/inMemory'
import type { RealtimeEvent } from './types'

export interface RealtimeEffects {
  publish(event: RealtimeEvent): Promise<void>
  subscribe(args: { signal?: AbortSignal; log: Logger }): AsyncIterable<RealtimeEvent>
}

// In-process pub/sub: the mutation procedure publishes; the SSE handler in
// the same process reads it out. Single-instance Vercel deployment, so no
// cross-process fan-out is needed.
export const realtime = inMemory
export type { RealtimeEvent }
