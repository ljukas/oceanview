import { randomUUID } from 'node:crypto'
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { queue, realtime, storage } from '~/lib/effects'
import { SHARP_DECODABLE_MIME_SET } from '~/lib/image/blurhash'
import { protectedProcedure } from '~/lib/orpc/context'
import * as fileService from '~/lib/services/file'
import { FileDomainError } from '~/lib/services/file'

const DOCUMENT_MAX_BYTES = 25_000_000

const DOCUMENT_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

function rethrowAsORPC(err: unknown): never {
  if (!(err instanceof FileDomainError)) throw err
  switch (err.code) {
    case 'NOT_FOUND':
      throw new ORPCError('NOT_FOUND', { message: 'Filen hittades inte' })
    case 'CANNOT_DELETE_OTHERS_FILE':
      throw new ORPCError('FORBIDDEN', {
        message: 'Du kan bara radera dina egna filer',
      })
    case 'CANNOT_DELETE_AVATAR_VIA_DOCUMENT_DELETE':
      throw new ORPCError('BAD_REQUEST', {
        message: 'Profilbilder kan inte raderas här',
      })
  }
}

// Replace any character that isn't [A-Za-z0-9._-] with `-`. Used to keep
// document pathnames safe for URLs without losing the original filename.
function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 200)
}

export const fileRouter = {
  mintDocumentUpload: protectedProcedure
    .input(
      z.object({
        contentType: z.enum(DOCUMENT_MIME),
        sizeBytes: z.number().int().positive().max(DOCUMENT_MAX_BYTES),
        name: z.string().min(1).max(255),
        folder: z.string().max(255).nullable().optional(),
      }),
    )
    .handler(async ({ input }) => {
      return storage.mintUploadToken({
        access: 'private',
        pathname: `documents/${randomUUID()}/${safeFilename(input.name)}`,
        contentType: input.contentType,
        maxBytes: DOCUMENT_MAX_BYTES,
      })
    }),

  confirmDocumentUpload: protectedProcedure
    .input(
      z.object({
        pathname: z.string().min(1).max(512),
        name: z.string().min(1).max(255),
        sizeBytes: z.number().int().positive().max(DOCUMENT_MAX_BYTES),
        folder: z.string().max(255).nullable().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      if (!input.pathname.includes('documents/')) {
        throw new ORPCError('FORBIDDEN', { message: 'Ogiltig sökväg' })
      }
      const blob = await storage.head('private', input.pathname)
      if (!blob) {
        throw new ORPCError('NOT_FOUND', { message: 'Filen hittades inte i lagringen' })
      }
      const inserted = await fileService.confirmUpload({
        ownerId: context.user.id,
        pathname: input.pathname,
        name: input.name,
        mime: blob.contentType,
        sizeBytes: input.sizeBytes,
        folder: input.folder ?? null,
        access: 'private',
      })
      context.log.info('document uploaded', { fileId: inserted.id, pathname: input.pathname })
      if (SHARP_DECODABLE_MIME_SET.has(inserted.mime)) {
        await queue.publish('blurhash', { fileId: inserted.id }).catch((error) => {
          context.log.warn('failed to enqueue document blurhash', { fileId: inserted.id, error })
        })
      }
      await realtime.publish({ kind: 'file.changed', ids: [inserted.id] })
      return { id: inserted.id }
    }),

  listDocuments: protectedProcedure.handler(() => fileService.listAllDocuments()),

  deleteDocument: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, context }) => {
      let deleted: Awaited<ReturnType<typeof fileService.softDelete>>
      try {
        deleted = await fileService.softDelete({
          id: input.id,
          actingUserId: context.user.id,
          actingUserRole: context.user.role ?? null,
        })
      } catch (err) {
        rethrowAsORPC(err)
      }
      await storage.delete('private', deleted.pathname)
      context.log.info('document deleted', {
        fileId: deleted.id,
        ownerId: deleted.ownerId,
        actorId: context.user.id,
      })
      await realtime.publish({ kind: 'file.changed', ids: [deleted.id] })
    }),
}
