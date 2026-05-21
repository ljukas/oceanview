import { eventIterator } from '@orpc/server'
import { realtime } from '~/lib/effects'
import { realtimeEventSchema } from '~/lib/effects/realtime/types'
import { protectedProcedure } from '~/lib/orpc/context'

export const realtimeRouter = {
  // One SSE stream per authenticated tab. GET + eventIterator output schema
  // tells oRPC's RPCHandler to enable the SSE encoder (matches the oRPC
  // TanStack Start playground pattern). AbortSignal is wired by oRPC for
  // client disconnects and function shutdown; we forward it to the adapter.
  events: protectedProcedure
    .route({ method: 'GET' })
    .output(eventIterator(realtimeEventSchema))
    .handler(async function* ({ context, signal }) {
      context.log.info('realtime subscriber connected')
      try {
        for await (const event of realtime.subscribe({ signal, log: context.log })) {
          yield event
        }
      } finally {
        context.log.info('realtime subscriber disconnected')
      }
    }),
}
