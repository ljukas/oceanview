import { randomUUID } from 'node:crypto'
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { queue, realtime, storage } from '~/lib/effects'
import { SHARP_DECODABLE_MIME_SET } from '~/lib/image/blurhash'
import { adminProcedure, protectedProcedure } from '~/lib/orpc/context'
import * as documentService from '~/lib/services/document'
import { DocumentDomainError } from '~/lib/services/document'
import * as documentEventService from '~/lib/services/documentEvent'
import * as fileService from '~/lib/services/file'
import { joinFilename, replacePathnameBasename, safeFilename } from '~/utils/filename'

// No mime whitelist (ADR-0010 §M): any contentType is accepted; the grid renders
// a mime icon for types without a thumbnail worker. 100 MB cap at the boundary.
const DOCUMENT_MAX_BYTES = 100_000_000

// Image tiles load the original directly from the private store as an <img>
// (ADR-0006). The signed URL is generated per list call; 1 h comfortably
// outlasts a session and listDocuments refetches on document/folder changes.
const PREVIEW_URL_TTL_SECONDS = 3600

function rethrowAsORPC(err: unknown): never {
  if (!(err instanceof DocumentDomainError)) throw err
  switch (err.code) {
    case 'NOT_FOUND':
      throw new ORPCError('NOT_FOUND', { message: 'Dokumentet hittades inte' })
    case 'NOT_ADMIN':
      throw new ORPCError('FORBIDDEN', { message: 'Endast administratörer kan göra detta' })
    case 'NOT_DELETED':
      throw new ORPCError('BAD_REQUEST', { message: 'Dokumentet är inte borttaget' })
    case 'CANNOT_DELETE_OTHERS_DOCUMENT':
      throw new ORPCError('FORBIDDEN', {
        message: 'Du kan bara radera dina egna dokument',
      })
    case 'CANNOT_EDIT_OTHERS_DOCUMENT':
      throw new ORPCError('FORBIDDEN', {
        message: 'Du kan bara redigera dina egna dokument',
      })
    case 'FOLDER_NOT_FOUND':
      throw new ORPCError('NOT_FOUND', { message: 'Mappen hittades inte' })
    case 'FOLDER_DELETED':
      throw new ORPCError('BAD_REQUEST', { message: 'Mappen är borttagen' })
  }
}

export const documentRouter = {
  mintDocumentUpload: protectedProcedure
    .input(
      z.object({
        contentType: z.string().min(1).max(255),
        sizeBytes: z.number().int().positive().max(DOCUMENT_MAX_BYTES),
        name: z.string().min(1).max(255),
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
        folderId: z.uuid().nullable().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      if (!input.pathname.startsWith('documents/')) {
        throw new ORPCError('FORBIDDEN', { message: 'Ogiltig sökväg' })
      }
      const blob = await storage.head('private', input.pathname)
      if (!blob) {
        throw new ORPCError('NOT_FOUND', { message: 'Filen hittades inte i lagringen' })
      }
      let inserted: Awaited<ReturnType<typeof documentService.confirmUpload>>
      try {
        inserted = await documentService.confirmUpload({
          ownerId: context.user.id,
          pathname: input.pathname,
          name: input.name,
          mime: blob.contentType,
          sizeBytes: input.sizeBytes,
          folderId: input.folderId ?? null,
        })
      } catch (err) {
        rethrowAsORPC(err)
      }
      context.log.info('document uploaded', {
        documentId: inserted.document.id,
        fileId: inserted.file.id,
        pathname: input.pathname,
      })
      if (SHARP_DECODABLE_MIME_SET.has(inserted.file.mime)) {
        await queue
          .publish('blurhash', { fileId: inserted.file.id, kind: 'document' })
          .catch((error) => {
            context.log.warn('failed to enqueue document blurhash', {
              fileId: inserted.file.id,
              error,
            })
          })
        // Same gate as blurhash: only image mimes the prebuilt sharp binary can
        // decode get a rendered preview. PDFs render a mime-type icon for now —
        // `pdf_thumbnail` dispatch is deferred (see ADR-0010 §thumbnails).
        await queue
          .publish('image_thumbnail', { documentId: inserted.document.id })
          .catch((error) => {
            context.log.warn('failed to enqueue image thumbnail', {
              documentId: inserted.document.id,
              error,
            })
          })
      }
      await realtime.publish({ kind: 'document.changed', ids: [inserted.document.id] })
      return { id: inserted.document.id }
    }),

  listDocuments: protectedProcedure
    .input(z.object({ folderId: z.uuid().nullable() }))
    .handler(async ({ input }) => {
      const rows = await documentService.listDocumentsByFolderId(input.folderId)
      // Flatten for the current UI contract; the Phase 4 UI rewrite moves to the
      // structured { document, file, ownerName } shape directly. No preview URLs
      // here — the grid renders immediately (blurhash placeholder) and resolves
      // each image tile's signed URL lazily via `previewUrl` below.
      return rows.map((row) => ({
        id: row.document.id,
        ownerId: row.file.ownerId,
        name: row.document.name,
        extension: row.document.extension,
        folderId: row.document.folderId,
        mime: row.file.mime,
        sizeBytes: row.file.sizeBytes,
        blurhash: row.file.blurhash,
        // null = not attempted, '' = render failed (sentinel), else logical path
        // in the public store; resolve to a URL via getReadUrl('public', …).
        thumbnailPathname: row.document.thumbnailPathname,
        uploadedAt: row.file.uploadedAt,
        ownerName: row.ownerName,
      }))
    }),

  // Lazy, per-tile signed read URL for an image preview. The grid fetches this
  // only after render (and only for image mimes), so the document list stays
  // fast and the URLs never go stale in the list cache. The browser loads the
  // byte straight from storage — the download route can't serve <img> requests
  // (Sec-Fetch-Dest: image → 404). See ADR-0006.
  previewUrl: protectedProcedure.input(z.object({ id: z.uuid() })).handler(async ({ input }) => {
    const row = await documentService.findActiveById(input.id)
    if (!row) throw new ORPCError('NOT_FOUND', { message: 'Dokumentet hittades inte' })
    const url = await storage.getReadUrl(
      row.file.access,
      row.file.pathname,
      PREVIEW_URL_TTL_SECONDS,
    )
    return { url }
  }),

  renameDocument: protectedProcedure
    .input(z.object({ id: z.uuid(), name: z.string().min(1).max(255) }))
    .handler(async ({ input, context }) => {
      let updated: Awaited<ReturnType<typeof documentService.renameDocument>>
      try {
        updated = await documentService.renameDocument({
          id: input.id,
          newName: input.name,
          actorId: context.user.id,
          actorRole: context.user.role ?? null,
        })
      } catch (err) {
        rethrowAsORPC(err)
      }
      // Rename the stored byte so its basename — the prod (Vercel Blob) download
      // filename — tracks the new display name. Copy → repoint file.pathname →
      // delete old keeps the pathname pointing at an existing object at every
      // step. A storage failure leaves the (already committed) name rename
      // intact: the download still works under the old basename, so we log and
      // swallow rather than fail the user's rename. Orphaned blobs on partial
      // failure are tolerated (same posture as avatar/hard-delete cleanup).
      const oldPathname = updated.file.pathname
      const newBasename = safeFilename(
        joinFilename({ name: updated.document.name, extension: updated.document.extension }),
      )
      const newPathname = replacePathnameBasename(oldPathname, newBasename)
      if (newPathname !== oldPathname) {
        try {
          await storage.copy('private', oldPathname, newPathname, updated.file.mime)
          await fileService.updatePathname({ fileId: updated.file.id, pathname: newPathname })
          await storage.delete('private', oldPathname).catch((error) =>
            context.log.warn('failed to delete old document blob after rename', {
              fileId: updated.file.id,
              error,
            }),
          )
        } catch (error) {
          context.log.warn('failed to rename document blob; pathname unchanged', {
            documentId: updated.document.id,
            error,
          })
        }
      }
      await realtime.publish({ kind: 'document.changed', ids: [updated.document.id] })
      return { id: updated.document.id }
    }),

  moveDocument: protectedProcedure
    .input(z.object({ id: z.uuid(), folderId: z.uuid().nullable() }))
    .handler(async ({ input, context }) => {
      let updated: Awaited<ReturnType<typeof documentService.moveDocument>>
      try {
        updated = await documentService.moveDocument({
          id: input.id,
          newFolderId: input.folderId,
          actorId: context.user.id,
          actorRole: context.user.role ?? null,
        })
      } catch (err) {
        rethrowAsORPC(err)
      }
      await realtime.publish({ kind: 'document.changed', ids: [updated.document.id] })
      return { id: updated.document.id }
    }),

  deleteDocument: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, context }) => {
      let deleted: Awaited<ReturnType<typeof documentService.softDelete>>
      try {
        deleted = await documentService.softDelete({
          id: input.id,
          actingUserId: context.user.id,
          actingUserRole: context.user.role ?? null,
        })
      } catch (err) {
        rethrowAsORPC(err)
      }
      context.log.info('document deleted', {
        documentId: deleted.document.id,
        fileId: deleted.file.id,
        ownerId: deleted.file.ownerId,
        actorId: context.user.id,
      })
      await realtime.publish({ kind: 'document.changed', ids: [deleted.document.id] })
    }),

  restoreDocument: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, context }) => {
      let restored: Awaited<ReturnType<typeof documentService.restoreDocument>>
      try {
        restored = await documentService.restoreDocument({
          id: input.id,
          actorId: context.user.id,
          actorRole: context.user.role ?? null,
        })
      } catch (err) {
        rethrowAsORPC(err)
      }
      await realtime.publish({ kind: 'document.changed', ids: [restored.document.id] })
      return { id: restored.document.id }
    }),

  documentHistory: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .handler(({ input }) => documentEventService.listForDocument(input.id)),
}
