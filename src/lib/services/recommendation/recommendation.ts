import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { file, recommendation, recommendationPhoto, recommendationTag, user } from '~/lib/db/schema'
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

export interface RecommendationListItem {
  id: string
  title: string
  description: string | null
  lat: number
  lng: number
  authorId: string | null
  authorName: string | null
  createdAt: Date
  updatedAt: Date
  photos: Array<{
    id: string
    fileId: string
    pathname: string
    blurhash: string | null
    sortOrder: number
  }>
  tagIds: string[]
}

async function assemble(
  rows: Array<{
    id: string
    title: string
    description: string | null
    lat: number
    lng: number
    authorId: string | null
    authorName: string | null
    createdAt: Date
    updatedAt: Date
  }>,
): Promise<RecommendationListItem[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)

  const photoRows = await db
    .select({
      id: recommendationPhoto.id,
      recommendationId: recommendationPhoto.recommendationId,
      fileId: recommendationPhoto.fileId,
      pathname: file.pathname,
      blurhash: file.blurhash,
      sortOrder: recommendationPhoto.sortOrder,
    })
    .from(recommendationPhoto)
    .innerJoin(file, eq(recommendationPhoto.fileId, file.id))
    .where(inArray(recommendationPhoto.recommendationId, ids))
    .orderBy(asc(recommendationPhoto.sortOrder))

  const tagRows = await db
    .select({
      recommendationId: recommendationTag.recommendationId,
      tagId: recommendationTag.tagId,
    })
    .from(recommendationTag)
    .where(inArray(recommendationTag.recommendationId, ids))

  return rows.map((r) => ({
    ...r,
    photos: photoRows
      .filter((p) => p.recommendationId === r.id)
      .map(({ recommendationId: _omit, ...p }) => p),
    tagIds: tagRows.filter((t) => t.recommendationId === r.id).map((t) => t.tagId),
  }))
}

const baseColumns = {
  id: recommendation.id,
  title: recommendation.title,
  description: recommendation.description,
  lat: recommendation.lat,
  lng: recommendation.lng,
  authorId: recommendation.authorId,
  authorName: user.name,
  createdAt: recommendation.createdAt,
  updatedAt: recommendation.updatedAt,
}

export async function listRecommendations(): Promise<RecommendationListItem[]> {
  const rows = await db
    .select(baseColumns)
    .from(recommendation)
    .leftJoin(user, eq(recommendation.authorId, user.id))
    .where(isNull(recommendation.deletedAt))
    .orderBy(desc(recommendation.createdAt))
  return assemble(rows)
}

export interface UpdateRecommendationInput {
  id: string
  actorId: string
  actorRole: string | null
  title: string
  description?: string | null
  lat: number
  lng: number
  tagIds: string[]
}

export async function updateRecommendation(
  input: UpdateRecommendationInput,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ authorId: recommendation.authorId })
      .from(recommendation)
      .where(and(eq(recommendation.id, input.id), isNull(recommendation.deletedAt)))
      .limit(1)
    if (!row) throw new RecommendationDomainError('NOT_FOUND')
    if (input.actorRole !== 'admin' && row.authorId !== input.actorId) {
      throw new RecommendationDomainError('CANNOT_EDIT_OTHERS_RECOMMENDATION')
    }

    await tx
      .update(recommendation)
      .set({
        title: input.title,
        description: input.description ?? null,
        lat: input.lat,
        lng: input.lng,
      })
      .where(eq(recommendation.id, input.id))

    await tx.delete(recommendationTag).where(eq(recommendationTag.recommendationId, input.id))
    if (input.tagIds.length > 0) {
      await tx
        .insert(recommendationTag)
        .values(input.tagIds.map((tagId) => ({ recommendationId: input.id, tagId })))
    }

    return { id: input.id }
  })
}

export async function findRecommendation(id: string): Promise<RecommendationListItem> {
  const rows = await db
    .select(baseColumns)
    .from(recommendation)
    .leftJoin(user, eq(recommendation.authorId, user.id))
    .where(and(eq(recommendation.id, id), isNull(recommendation.deletedAt)))
    .limit(1)
  if (rows.length === 0) throw new RecommendationDomainError('NOT_FOUND')
  const [item] = await assemble(rows)
  return item
}
