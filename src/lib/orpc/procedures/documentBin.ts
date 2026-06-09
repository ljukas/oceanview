import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { realtime, storage } from '~/lib/effects'
import { adminProcedure } from '~/lib/orpc/context'
import * as documentService from '~/lib/services/document'
import { DocumentDomainError } from '~/lib/services/document'
import * as folderService from '~/lib/services/folder'

function rethrowAsORPC(err: unknown): never {
  if (!(err instanceof DocumentDomainError)) throw err
  switch (err.code) {
    case 'NOT_FOUND':
      throw new ORPCError('NOT_FOUND', { message: 'Dokumentet hittades inte' })
    case 'NOT_ADMIN':
      throw new ORPCError('FORBIDDEN', { message: 'Endast administratörer kan göra detta' })
    default:
      // Other DocumentDomainError codes are unreachable from hardDeleteDocument.
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Oväntat fel' })
  }
}

export const binRouter = {
  list: adminProcedure.handler(() => folderService.listBin()),

  // Folder cascade hard-delete is deferred (ADR-0010); admins restore folder
  // subtrees instead. Only individual documents can be permanently purged.
  hardDeleteDocument: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, context }) => {
      let result: Awaited<ReturnType<typeof documentService.hardDeleteDocument>>
      try {
        result = await documentService.hardDeleteDocument({
          id: input.id,
          actorId: context.user.id,
          actorRole: context.user.role ?? null,
        })
      } catch (err) {
        rethrowAsORPC(err)
      }
      // Row + history are committed; now drop the bytes. Best-effort — a failed
      // storage delete leaves an orphaned blob but the DB is already consistent.
      await storage.delete('private', result.pathname).catch((error) => {
        context.log.warn('failed to delete document blob', { pathname: result.pathname, error })
      })
      if (result.thumbnailPathname) {
        await storage.delete('public', result.thumbnailPathname).catch((error) => {
          context.log.warn('failed to delete thumbnail blob', {
            pathname: result.thumbnailPathname,
            error,
          })
        })
      }
      context.log.info('document hard-deleted', { documentId: input.id, actorId: context.user.id })
      await realtime.publish(
        { kind: 'document.changed', ids: [input.id] },
        { source: context.user.id },
      )
      // The document was purged from the (admin) bin.
      await realtime.publish({ kind: 'bin.changed' }, { source: context.user.id })
    }),
}
