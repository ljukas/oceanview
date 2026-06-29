import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { queue, realtime, storage } from '~/lib/effects'
import { stripEnvPrefix } from '~/lib/effects/storage'
import { SHARP_DECODABLE_MIME_SET } from '~/lib/image/blurhash'
import { UPLOAD_IMAGE_EXT, UPLOAD_IMAGE_MIME } from '~/lib/orpc/imageUpload'
import {
  createRecommendation,
  findRecommendation,
  listRecommendations,
  MAX_PHOTOS,
  MIN_PHOTOS,
  RecommendationDomainError,
  type RecommendationDomainErrorCode,
  reorderPhotos,
  softDeleteRecommendation,
  updateRecommendation,
} from '~/lib/services/recommendation'
import { protectedProcedure } from '../context'

const MAX_PHOTO_BYTES = 15_000_000

export const recommendationErrors = {
  NOT_FOUND: { status: 404 },
  CANNOT_EDIT_OTHERS_RECOMMENDATION: { status: 403 },
  CANNOT_DELETE_OTHERS_RECOMMENDATION: { status: 403 },
  NO_PHOTOS: { status: 400 },
  TOO_MANY_PHOTOS: { status: 400 },
  DUPLICATE_PHOTOS: { status: 400 },
} satisfies Record<RecommendationDomainErrorCode, { status: number }>

const photoInput = z.object({
  pathname: z.string().min(1).max(512),
  sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
})

// The map/list render via the unpic transformer, which needs a URL — the service
// returns only the stored pathname. The procedure (glue, allowed to use effects;
// the service is not) maps pathname -> public read URL. For the public store
// getReadUrl returns a stable URL (vercelBlob: head().url; s3: deterministic), so
// ttl is effectively unused here.
//
// A public-store pathname carries a randomUUID and is never reused, so its URL is
// immutable — memoize it. On Vercel Blob each resolution is a head() round-trip, so
// without this every list load fires one HEAD per cover and every detail open one
// per photo; the cache collapses repeat/warm loads to zero. Bounded by total photo
// count (small here), so no eviction. The deeper fix — denormalize a url column
// populated once at upload-confirm (the avatar `image` precedent) — needs a
// migration + write-path change; revisit if list latency ever matters (ADR-0012).
const PUBLIC_URL_TTL_SECONDS = 3600
const publicUrlCache = new Map<string, Promise<string>>()
function publicPhotoUrl(pathname: string): Promise<string> {
  let url = publicUrlCache.get(pathname)
  if (!url) {
    // Evict on rejection: vercelBlob resolves the public URL via a fallible
    // head() round-trip, and the cache holds the pending promise — without this
    // a transient failure would poison the pathname for the instance lifetime,
    // re-returning the rejected promise instead of retrying. A resolved URL is
    // kept indefinitely (the pathname is an immutable randomUUID; see above).
    url = storage.getReadUrl('public', pathname, PUBLIC_URL_TTL_SECONDS).catch((e) => {
      publicUrlCache.delete(pathname)
      throw e
    })
    publicUrlCache.set(pathname, url)
  }
  return url
}

export const recommendationRouter = {
  mintImageUpload: protectedProcedure
    .input(
      z.object({
        contentType: z.enum(UPLOAD_IMAGE_MIME),
        sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
        name: z.string().min(1).max(255),
      }),
    )
    .handler(async ({ input, context }) => {
      const pathname = `recommendations/${context.user.id}/${randomUUID()}.${UPLOAD_IMAGE_EXT[input.contentType]}`
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
        photos: z.array(photoInput).min(MIN_PHOTOS).max(MAX_PHOTOS),
      }),
    )
    .handler(async ({ input, context, errors }) => {
      const prefix = `recommendations/${context.user.id}/`
      // Cheap ownership check first (no IO), then verify the uploaded blobs in
      // parallel — these heads are independent and on a user-facing submit path.
      for (const p of input.photos) {
        if (!stripEnvPrefix(p.pathname).startsWith(prefix)) throw errors.INVALID_PATH()
      }
      const verified = await Promise.all(
        input.photos.map(async (p) => {
          const blob = await storage.head('public', p.pathname)
          if (!blob) throw errors.FILE_NOT_IN_STORAGE()
          return { pathname: p.pathname, mime: blob.contentType, sizeBytes: p.sizeBytes }
        }),
      )

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

      await Promise.all(
        result.photoFileIds
          .filter((_, i) => SHARP_DECODABLE_MIME_SET.has(verified[i].mime))
          .map((fileId) =>
            queue
              .publish('blurhash', { fileId, kind: 'recommendation' })
              .catch((e) => context.log.warn('blurhash enqueue failed', { error: e })),
          ),
      )
      await realtime.publish(
        { kind: 'recommendation.changed', ids: [result.id] },
        { source: context.user.id },
      )
      return result
    }),

  list: protectedProcedure.handler(async () => {
    const items = await listRecommendations()
    // Only the cover (lowest sort_order = photos[0], already ordered) shows on the
    // map/list, so enrich just that one per place to keep storage heads bounded.
    return Promise.all(
      items.map(async (item) => ({
        ...item,
        coverUrl: item.photos[0] ? await publicPhotoUrl(item.photos[0].pathname) : null,
      })),
    )
  }),

  get: protectedProcedure
    .errors(recommendationErrors)
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input, errors }) => {
      let item: Awaited<ReturnType<typeof findRecommendation>>
      try {
        item = await findRecommendation(input.id)
      } catch (err) {
        if (err instanceof RecommendationDomainError) throw errors[err.code]()
        throw err
      }
      // The detail carousel shows every photo, so enrich all with public URLs.
      const photos = await Promise.all(
        item.photos.map(async (p) => ({ ...p, url: await publicPhotoUrl(p.pathname) })),
      )
      return { ...item, photos }
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
