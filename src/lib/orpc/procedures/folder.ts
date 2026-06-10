import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { realtime } from '~/lib/effects'
import { adminProcedure, protectedProcedure } from '~/lib/orpc/context'
import * as folderService from '~/lib/services/folder'
import { FolderDomainError } from '~/lib/services/folder'
import { m } from '~/paraglide/messages'

function rethrowAsORPC(err: unknown): never {
  if (!(err instanceof FolderDomainError)) throw err
  switch (err.code) {
    case 'NOT_FOUND':
      throw new ORPCError('NOT_FOUND', { message: m.folder_error_not_found() })
    case 'NOT_ADMIN':
      throw new ORPCError('FORBIDDEN', { message: m.common_error_admin_only() })
    case 'NAME_TAKEN_IN_PARENT':
      throw new ORPCError('CONFLICT', { message: m.folder_error_name_taken() })
    case 'INVALID_NAME':
      throw new ORPCError('BAD_REQUEST', { message: m.folder_error_invalid_name() })
    case 'PARENT_NOT_FOUND':
      throw new ORPCError('NOT_FOUND', { message: m.folder_error_parent_not_found() })
    case 'CANNOT_MOVE_INTO_DESCENDANT':
      throw new ORPCError('BAD_REQUEST', {
        message: m.folder_error_move_into_descendant(),
      })
    case 'ALREADY_DELETED':
      throw new ORPCError('BAD_REQUEST', { message: m.folder_error_already_deleted() })
    case 'PARENT_DELETED':
      throw new ORPCError('BAD_REQUEST', {
        message: m.folder_error_parent_deleted(),
      })
  }
}

export const folderRouter = {
  createFolder: protectedProcedure
    .input(
      z.object({
        parentId: z.uuid().nullable().optional(),
        name: z.string().min(1).max(255),
      }),
    )
    .handler(async ({ input, context }) => {
      let created: Awaited<ReturnType<typeof folderService.createFolder>>
      try {
        created = await folderService.createFolder({
          parentId: input.parentId ?? null,
          name: input.name,
          createdBy: context.user.id,
        })
      } catch (err) {
        rethrowAsORPC(err)
      }
      await realtime.publish(
        { kind: 'folder.changed', ids: [created.id] },
        { source: context.user.id },
      )
      return created
    }),

  renameFolder: adminProcedure
    .input(z.object({ id: z.uuid(), name: z.string().min(1).max(255) }))
    .handler(async ({ input, context }) => {
      let updated: Awaited<ReturnType<typeof folderService.renameFolderAsAdmin>>
      try {
        updated = await folderService.renameFolderAsAdmin({
          id: input.id,
          newName: input.name,
          actorId: context.user.id,
          actorRole: context.user.role ?? null,
        })
      } catch (err) {
        rethrowAsORPC(err)
      }
      // Descendant document haystacks changed too.
      await realtime.publish(
        { kind: 'folder.changed', ids: [updated.id] },
        { source: context.user.id },
      )
      await realtime.publish({ kind: 'document.changed' }, { source: context.user.id })
      return updated
    }),

  moveFolder: adminProcedure
    .input(z.object({ id: z.uuid(), newParentId: z.uuid().nullable() }))
    .handler(async ({ input, context }) => {
      let updated: Awaited<ReturnType<typeof folderService.moveFolderAsAdmin>>
      try {
        updated = await folderService.moveFolderAsAdmin({
          id: input.id,
          newParentId: input.newParentId,
          actorId: context.user.id,
          actorRole: context.user.role ?? null,
        })
      } catch (err) {
        rethrowAsORPC(err)
      }
      await realtime.publish(
        { kind: 'folder.changed', ids: [updated.id] },
        { source: context.user.id },
      )
      await realtime.publish({ kind: 'document.changed' }, { source: context.user.id })
      return updated
    }),

  softDeleteFolder: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, context }) => {
      let result: Awaited<ReturnType<typeof folderService.softDeleteFolderAsAdmin>>
      try {
        result = await folderService.softDeleteFolderAsAdmin({
          id: input.id,
          actorId: context.user.id,
          actorRole: context.user.role ?? null,
        })
      } catch (err) {
        rethrowAsORPC(err)
      }
      context.log.info('folder soft-deleted', {
        folderId: input.id,
        actorId: context.user.id,
        ...result,
      })
      await realtime.publish({ kind: 'folder.changed' }, { source: context.user.id })
      await realtime.publish({ kind: 'document.changed' }, { source: context.user.id })
      // The folder and its documents moved in/out of the (admin) bin.
      await realtime.publish({ kind: 'bin.changed' }, { source: context.user.id })
      return result
    }),

  restoreFolder: adminProcedure
    .input(z.object({ correlationId: z.uuid() }))
    .handler(async ({ input, context }) => {
      let result: Awaited<ReturnType<typeof folderService.restoreByCorrelationAsAdmin>>
      try {
        result = await folderService.restoreByCorrelationAsAdmin({
          correlationId: input.correlationId,
          actorId: context.user.id,
          actorRole: context.user.role ?? null,
        })
      } catch (err) {
        rethrowAsORPC(err)
      }
      context.log.info('folder subtree restored', {
        correlationId: input.correlationId,
        actorId: context.user.id,
        ...result,
      })
      await realtime.publish({ kind: 'folder.changed' }, { source: context.user.id })
      await realtime.publish({ kind: 'document.changed' }, { source: context.user.id })
      // The folder and its documents moved in/out of the (admin) bin.
      await realtime.publish({ kind: 'bin.changed' }, { source: context.user.id })
      return result
    }),

  listChildren: protectedProcedure
    .input(z.object({ folderId: z.uuid().nullable().optional() }))
    .handler(({ input }) => folderService.listChildren(input.folderId ?? null)),

  tree: protectedProcedure.handler(() => folderService.listTree()),
}
