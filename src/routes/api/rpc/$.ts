import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { createFileRoute } from '@tanstack/react-router'
import { appRouter } from '~/lib/orpc/router'

const handler = new RPCHandler(appRouter, {
  interceptors: [onError((error) => console.error(error))],
})

export const Route = createFileRoute('/api/rpc/$')({
  server: {
    handlers: {
      ANY: async ({ request }: { request: Request }) => {
        const { response } = await handler.handle(request, {
          prefix: '/api/rpc',
          context: { headers: request.headers },
        })
        return response ?? new Response('Not Found', { status: 404 })
      },
    },
  },
})
