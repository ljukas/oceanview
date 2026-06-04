import { createFileRoute } from '@tanstack/react-router'
import { auth } from '~/lib/auth'
import { storage } from '~/lib/effects'
import { createRequestLogger } from '~/lib/logger/server'
import * as documentService from '~/lib/services/document'

export const Route = createFileRoute('/api/files/view/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const { log } = createRequestLogger(request)
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session?.user) {
          return new Response('Unauthorized', { status: 401 })
        }

        const row = await documentService.findActiveById(params.id)
        if (!row) {
          return new Response('Not Found', { status: 404 })
        }

        // No `downloadFilename` → no forced `Content-Disposition: attachment`, so
        // the browser applies its default per-content-type behavior: images and
        // PDFs render inline, anything it can't display falls back to a download.
        const url = await storage.getReadUrl(row.file.access, row.file.pathname, 60)
        log.info('document view', {
          documentId: row.document.id,
          fileId: row.file.id,
          userId: session.user.id,
        })
        return new Response(null, {
          status: 302,
          headers: { Location: url },
        })
      },
    },
  },
})
