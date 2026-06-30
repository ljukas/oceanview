import { randomUUID } from 'node:crypto'
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { auth } from '~/lib/auth'
import { queue, realtime, storage } from '~/lib/effects'
import { stripEnvPrefix } from '~/lib/effects/storage'
import { HEIC_MIME } from '~/lib/image/heicMime'
import { protectedProcedure } from '~/lib/orpc/context'
import { UPLOAD_IMAGE_EXT, UPLOAD_IMAGE_MIME } from '~/lib/orpc/imageUpload'
import * as fileService from '~/lib/services/file'
import { m } from '~/paraglide/messages'

const AVATAR_MAX_BYTES = 5_000_000

export const imageRouter = {
  mintAvatarUpload: protectedProcedure
    .input(
      z.object({
        contentType: z.enum(UPLOAD_IMAGE_MIME),
        sizeBytes: z.number().int().positive().max(AVATAR_MAX_BYTES),
        name: z.string().min(1).max(255),
      }),
    )
    .handler(async ({ input, context }) => {
      return storage.mintUploadToken({
        access: 'public',
        pathname: `avatars/${context.user.id}/${randomUUID()}.${UPLOAD_IMAGE_EXT[input.contentType]}`,
        contentType: input.contentType,
        maxBytes: AVATAR_MAX_BYTES,
      })
    }),

  confirmAvatarUpload: protectedProcedure
    .input(
      z.object({
        pathname: z.string().min(1).max(512),
        name: z.string().min(1).max(255),
        sizeBytes: z.number().int().positive().max(AVATAR_MAX_BYTES),
      }),
    )
    .handler(async ({ input, context }) => {
      // Anchored ownership check on the logical pathname — `includes()` would
      // also accept `avatars/<id>/` appearing mid-path under someone else's key.
      if (!stripEnvPrefix(input.pathname).startsWith(`avatars/${context.user.id}/`)) {
        throw new ORPCError('FORBIDDEN', { message: m.image_error_not_yours() })
      }
      const blob = await storage.head('public', input.pathname)
      if (!blob) {
        throw new ORPCError('NOT_FOUND', { message: m.file_error_not_in_storage() })
      }

      const { newRow, previousPathnames } = await fileService.replaceAvatarForUser({
        userId: context.user.id,
        newRow: {
          pathname: input.pathname,
          mime: blob.contentType,
          sizeBytes: input.sizeBytes,
        },
      })
      await Promise.all(
        previousPathnames.map((p) =>
          storage.delete('public', p).catch((error) => {
            context.log.warn('failed to delete previous avatar blob', { pathname: p, error })
          }),
        ),
      )
      const isHeic = HEIC_MIME.has(blob.contentType)
      if (isHeic) {
        // Defer the avatar pointer + blurhash to the transcode worker (it sets
        // user.image to the JPEG url and enqueues blurhash itself). Until then the
        // avatar falls back to initials on shared surfaces; the uploader shows its
        // local EXIF preview. (spec §E)
        await queue
          .publish('heic_transcode', { fileId: newRow.id, kind: 'avatar', userId: context.user.id })
          .catch((error) => {
            context.log.warn('failed to enqueue avatar heic_transcode', {
              fileId: newRow.id,
              error,
            })
          })
      } else {
        await queue
          .publish('blurhash', { fileId: newRow.id, kind: 'avatar', userId: context.user.id })
          .catch((error) => {
            context.log.warn('failed to enqueue avatar blurhash', { fileId: newRow.id, error })
          })
        await auth.api.updateUser({
          body: { image: blob.url },
          headers: context.headers,
        })
      }
      context.log.info('avatar uploaded', {
        pathname: input.pathname,
        replacedCount: previousPathnames.length,
      })
      await realtime.publish(
        { kind: 'user.changed', ids: [context.user.id] },
        { source: context.user.id },
      )
      return { imageUrl: isHeic ? null : blob.url, pending: isHeic }
    }),
}
