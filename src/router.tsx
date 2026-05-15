import '~/lib/zod-locale'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 30_000,
    defaultStaleTime: 30_000,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
  })
  return router
}
