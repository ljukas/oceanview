import { eventIterator } from '@orpc/server'
import { presence, realtime } from '~/lib/effects'
import { realtimeEventSchema } from '~/lib/effects/realtime/types'
import { protectedProcedure } from '~/lib/orpc/context'

export const realtimeRouter = {
  // One SSE stream per authenticated tab. GET + eventIterator output schema
  // tells oRPC's RPCHandler to enable the SSE encoder (matches the oRPC
  // TanStack Start playground pattern). AbortSignal is wired by oRPC for
  // client disconnects and function shutdown; we forward it to the adapter.
  //
  // Doubles as the presence ingress: connect → acquire, disconnect → release.
  // This is the one publish site for `presence.changed` and the only
  // intentional exception to ADR-0004's "publish from mutation procedures"
  // rule, because presence state *is* the SSE subscription state — there's
  // no DB mutation to attach it to.
  events: protectedProcedure
    .route({ method: 'GET' })
    .output(eventIterator(realtimeEventSchema))
    .handler(async function* ({ context, signal }) {
      context.log.info('realtime subscriber connected')
      const becameOnline = await presence.acquire(context.user.id)
      if (becameOnline) await realtime.publish({ kind: 'presence.changed' })
      try {
        for await (const event of realtime.subscribe({ signal, log: context.log })) {
          yield event
        }
      } finally {
        const becameOffline = await presence.release(context.user.id)
        if (becameOffline) await realtime.publish({ kind: 'presence.changed' })
        context.log.info('realtime subscriber disconnected')
      }
    }),
}
