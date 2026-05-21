import { MemoryPublisher } from '@orpc/experimental-publisher/memory'
import type { RealtimeEffects } from '../realtime'
import type { RealtimeEvent } from '../types'

const CHANNEL = 'event' as const

export function createInMemoryRealtime(): RealtimeEffects {
  const publisher = new MemoryPublisher<{ [CHANNEL]: RealtimeEvent }>()
  return {
    async publish(event) {
      publisher.publish(CHANNEL, event)
    },
    subscribe({ signal }) {
      return publisher.subscribe(CHANNEL, { signal })
    },
  }
}

export const inMemory = createInMemoryRealtime()
