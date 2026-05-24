import { createFileRoute } from '@tanstack/react-router'
import { auth } from '~/lib/auth'
import { storage } from '~/lib/effects'
import { createRequestLogger } from '~/lib/logger/server'
import * as fileService from '~/lib/services/file'

export const Route = createFileRoute('/api/files/download/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const { log } = createRequestLogger(request)
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session?.user) {
          return new Response('Unauthorized', { status: 401 })
        }

        const row = await fileService.findActiveById(params.id)
        if (!row || row.access !== 'private') {
          return new Response('Not Found', { status: 404 })
        }

        const url = await storage.getReadUrl(row.access, row.pathname, 60)
        log.info('document download', { fileId: row.id, userId: session.user.id })
        return new Response(null, {
          status: 302,
          headers: { Location: url },
        })
      },
    },
  },
})
