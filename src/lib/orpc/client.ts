import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { createRouterClient, type RouterClient } from '@orpc/server'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { appRouter } from './router'

const getORPCClient = createIsomorphicFn()
  .server(() =>
    createRouterClient(appRouter, {
      context: async () => ({ headers: getRequest().headers }),
    }),
  )
  .client(
    (): RouterClient<typeof appRouter> =>
      createORPCClient(new RPCLink({ url: `${window.location.origin}/api/rpc` })),
  )

export const client: RouterClient<typeof appRouter> = getORPCClient()
export const orpc = createTanstackQueryUtils(client)
