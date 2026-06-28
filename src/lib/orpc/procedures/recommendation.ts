import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { queue, realtime, storage } from '~/lib/effects'
import { stripEnvPrefix } from '~/lib/effects/storage'
import { SHARP_DECODABLE_MIME_SET } from '~/lib/image/blurhash'
import {
  createRecommendation,
  findRecommendation,
  listRecommendations,
  MAX_PHOTOS,
  RecommendationDomainError,
  type RecommendationDomainErrorCode,
  reorderPhotos,
  softDeleteRecommendation,
  updateRecommendation,
} from '~/lib/services/recommendation'
import { protectedProcedure } from '../context'

const IMAGE_MIME = z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
const IMAGE_EXT: Record<z.infer<typeof IMAGE_MIME>, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}
const MAX_PHOTO_BYTES = 15_000_000

export const recommendationErrors = {
  NOT_FOUND: { status: 404 },
  CANNOT_EDIT_OTHERS_RECOMMENDATION: { status: 403 },
  CANNOT_DELETE_OTHERS_RECOMMENDATION: { status: 403 },
  NO_PHOTOS: { status: 400 },
  TOO_MANY_PHOTOS: { status: 400 },
} satisfies Record<RecommendationDomainErrorCode, { status: number }>

const photoInput = z.object({
  pathname: z.string().min(1).max(512),
  sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
})

export const recommendationRouter = {
  mintImageUpload: protectedProcedure
    .input(
      z.object({
        contentType: IMAGE_MIME,
        sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
        name: z.string().min(1).max(255),
      }),
    )
    .handler(async ({ input, context }) => {
      const pathname = `recommendations/${context.user.id}/${randomUUID()}.${IMAGE_EXT[input.contentType]}`
      return storage.mintUploadToken({
        access: 'public',
        pathname,
        contentType: input.contentType,
        maxBytes: MAX_PHOTO_BYTES,
      })
    }),

  create: protectedProcedure
    .errors({
      ...recommendationErrors,
      INVALID_PATH: { status: 403 },
      FILE_NOT_IN_STORAGE: { status: 404 },
    })
    .input(
      z.object({
        title: z.string().min(1).max(255),
        description: z.string().max(2000).optional(),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        tagIds: z.array(z.string().uuid()).max(20),
        photos: z.array(photoInput).min(1).max(10),
      }),
    )
    .handler(async ({ input, context, errors }) => {
      const prefix = `recommendations/${context.user.id}/`
      const verified: Array<{ pathname: string; mime: string; sizeBytes: number }> = []
      for (const p of input.photos) {
        if (!stripEnvPrefix(p.pathname).startsWith(prefix)) throw errors.INVALID_PATH()
        const blob = await storage.head('public', p.pathname)
        if (!blob) throw errors.FILE_NOT_IN_STORAGE()
        verified.push({ pathname: p.pathname, mime: blob.contentType, sizeBytes: p.sizeBytes })
      }

      let result: Awaited<ReturnType<typeof createRecommendation>>
      try {
        result = await createRecommendation({
          authorId: context.user.id,
          title: input.title,
          description: input.description,
          lat: input.lat,
          lng: input.lng,
          tagIds: input.tagIds,
          photos: verified,
        })
      } catch (err) {
        if (err instanceof RecommendationDomainError) throw errors[err.code]()
        throw err
      }

      for (const [i, fileId] of result.photoFileIds.entries()) {
        if (SHARP_DECODABLE_MIME_SET.has(verified[i].mime)) {
          await queue
            .publish('blurhash', { fileId, kind: 'recommendation' })
            .catch((e) => context.log.warn('blurhash enqueue failed', { error: e }))
        }
      }
      await realtime.publish(
        { kind: 'recommendation.changed', ids: [result.id] },
        { source: context.user.id },
      )
      return result
    }),

  list: protectedProcedure.handler(() => listRecommendations()),

  get: protectedProcedure
    .errors(recommendationErrors)
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input, errors }) => {
      try {
        return await findRecommendation(input.id)
      } catch (err) {
        if (err instanceof RecommendationDomainError) throw errors[err.code]()
        throw err
      }
    }),

  update: protectedProcedure
    .errors(recommendationErrors)
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(255),
        description: z.string().max(2000).optional(),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        tagIds: z.array(z.string().uuid()).max(20),
      }),
    )
    .handler(async ({ input, context, errors }) => {
      let result: Awaited<ReturnType<typeof updateRecommendation>>
      try {
        result = await updateRecommendation({
          id: input.id,
          actorId: context.user.id,
          actorRole: context.user.role ?? null,
          title: input.title,
          description: input.description,
          lat: input.lat,
          lng: input.lng,
          tagIds: input.tagIds,
        })
      } catch (err) {
        if (err instanceof RecommendationDomainError) throw errors[err.code]()
        throw err
      }
      await realtime.publish(
        { kind: 'recommendation.changed', ids: [result.id] },
        { source: context.user.id },
      )
      return result
    }),

  reorderPhotos: protectedProcedure
    .errors(recommendationErrors)
    .input(
      z.object({
        id: z.string().uuid(),
        orderedPhotoIds: z.array(z.string().uuid()).min(1).max(MAX_PHOTOS),
      }),
    )
    .handler(async ({ input, context, errors }) => {
      let result: Awaited<ReturnType<typeof reorderPhotos>>
      try {
        result = await reorderPhotos({
          id: input.id,
          actorId: context.user.id,
          actorRole: context.user.role ?? null,
          orderedPhotoIds: input.orderedPhotoIds,
        })
      } catch (err) {
        if (err instanceof RecommendationDomainError) throw errors[err.code]()
        throw err
      }
      await realtime.publish(
        { kind: 'recommendation.changed', ids: [result.id] },
        { source: context.user.id },
      )
      return result
    }),

  softDelete: protectedProcedure
    .errors(recommendationErrors)
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input, context, errors }) => {
      let result: Awaited<ReturnType<typeof softDeleteRecommendation>>
      try {
        result = await softDeleteRecommendation({
          id: input.id,
          actorId: context.user.id,
          actorRole: context.user.role ?? null,
        })
      } catch (err) {
        if (err instanceof RecommendationDomainError) throw errors[err.code]()
        throw err
      }
      await realtime.publish(
        { kind: 'recommendation.changed', ids: [result.id] },
        { source: context.user.id },
      )
      return result
    }),
}
