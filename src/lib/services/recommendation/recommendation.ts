import { db } from '~/lib/db'
import { file, recommendation, recommendationPhoto, recommendationTag } from '~/lib/db/schema'
import { MAX_PHOTOS, MIN_PHOTOS, RecommendationDomainError } from './errors'

export interface CreateRecommendationInput {
  authorId: string
  title: string
  description?: string | null
  lat: number
  lng: number
  tagIds: string[]
  photos: Array<{ pathname: string; mime: string; sizeBytes: number }>
}

export async function createRecommendation(
  input: CreateRecommendationInput,
): Promise<{ id: string; photoFileIds: string[] }> {
  if (input.photos.length < MIN_PHOTOS) throw new RecommendationDomainError('NO_PHOTOS')
  if (input.photos.length > MAX_PHOTOS) throw new RecommendationDomainError('TOO_MANY_PHOTOS')

  return db.transaction(async (tx) => {
    const [rec] = await tx
      .insert(recommendation)
      .values({
        authorId: input.authorId,
        title: input.title,
        description: input.description ?? null,
        lat: input.lat,
        lng: input.lng,
      })
      .returning({ id: recommendation.id })

    const photoFileIds: string[] = []
    for (const [index, p] of input.photos.entries()) {
      const [f] = await tx
        .insert(file)
        .values({
          ownerId: input.authorId,
          pathname: p.pathname,
          mime: p.mime,
          sizeBytes: p.sizeBytes,
          access: 'public',
        })
        .returning({ id: file.id })
      await tx
        .insert(recommendationPhoto)
        .values({ recommendationId: rec.id, fileId: f.id, sortOrder: index })
      photoFileIds.push(f.id)
    }

    if (input.tagIds.length > 0) {
      await tx
        .insert(recommendationTag)
        .values(input.tagIds.map((tagId) => ({ recommendationId: rec.id, tagId })))
    }

    return { id: rec.id, photoFileIds }
  })
}
