import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { createRouterClient, type RouterClient } from '@orpc/server'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createRequestLogger } from '~/lib/logger/server'
import { appRouter } from './router'

const getORPCClient = createIsomorphicFn()
  .server(() =>
    createRouterClient(appRouter, {
      context: async () => {
        const request = getRequest()
        const { log, requestId } = createRequestLogger(request)
        return { headers: request.headers, log, requestId }
      },
    }),
  )
  .client(
    (): RouterClient<typeof appRouter> =>
      createORPCClient(new RPCLink({ url: `${window.location.origin}/api/rpc` })),
  )

export const client: RouterClient<typeof appRouter> = getORPCClient()
export const orpc = createTanstackQueryUtils(client)
