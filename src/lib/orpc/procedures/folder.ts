import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { realtime } from '~/lib/effects'
import { adminProcedure, protectedProcedure } from '~/lib/orpc/context'
import * as folderService from '~/lib/services/folder'
import { FolderDomainError } from '~/lib/services/folder'

function rethrowAsORPC(err: unknown): never {
  if (!(err instanceof FolderDomainError)) throw err
  switch (err.code) {
    case 'NOT_FOUND':
      throw new ORPCError('NOT_FOUND', { message: 'Mappen hittades inte' })
    case 'NOT_ADMIN':
      throw new ORPCError('FORBIDDEN', { message: 'Endast administratörer kan göra detta' })
    case 'NAME_TAKEN_IN_PARENT':
      throw new ORPCError('CONFLICT', { message: 'Det finns redan en mapp med det namnet här' })
    case 'INVALID_NAME':
      throw new ORPCError('BAD_REQUEST', { message: 'Ogiltigt mappnamn' })
    case 'PARENT_NOT_FOUND':
      throw new ORPCError('NOT_FOUND', { message: 'Föräldermappen hittades inte' })
    case 'CANNOT_MOVE_INTO_DESCENDANT':
      throw new ORPCError('BAD_REQUEST', {
        message: 'Du kan inte flytta en mapp till sig själv eller en undermapp',
      })
    case 'ALREADY_DELETED':
      throw new ORPCError('BAD_REQUEST', { message: 'Mappen är redan borttagen' })
    case 'PARENT_DELETED':
      throw new ORPCError('BAD_REQUEST', {
        message: 'Föräldermappen är borttagen — återställ den först',
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
      await realtime.publish({ kind: 'folder.changed', ids: [created.id] })
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
      await realtime.publish({ kind: 'folder.changed', ids: [updated.id] })
      await realtime.publish({ kind: 'document.changed' })
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
      await realtime.publish({ kind: 'folder.changed', ids: [updated.id] })
      await realtime.publish({ kind: 'document.changed' })
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
      await realtime.publish({ kind: 'folder.changed' })
      await realtime.publish({ kind: 'document.changed' })
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
      await realtime.publish({ kind: 'folder.changed' })
      await realtime.publish({ kind: 'document.changed' })
      return result
    }),

  listChildren: protectedProcedure
    .input(z.object({ folderId: z.uuid().nullable().optional() }))
    .handler(({ input }) => folderService.listChildren(input.folderId ?? null)),

  tree: protectedProcedure.handler(() => folderService.listTree()),
}
