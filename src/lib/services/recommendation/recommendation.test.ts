import { eq, inArray } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { db } from '~/lib/db'
import {
  file,
  recommendation,
  recommendationPhoto,
  recommendationTag,
  tag,
  user,
} from '~/lib/db/schema'
import { setupDatabase } from '~test/setup'
import {
  createRecommendation,
  findRecommendation,
  listRecommendations,
  reorderPhotos,
  softDeleteRecommendation,
  updateRecommendation,
} from './recommendation'

setupDatabase()

async function insertAuthor(email = 'anna@test.oceanview.local', role: 'user' | 'admin' = 'user') {
  const [row] = await db
    .insert(user)
    .values({ name: email, email, role })
    .returning({ id: user.id })
  return row.id
}
async function tagIds(...slugs: string[]) {
  const rows = await db.select({ id: tag.id, slug: tag.slug }).from(tag)
  return slugs.map((s) => rows.find((r) => r.slug === s)!.id)
}
function photo(name: string) {
  return { pathname: `recommendations/x/${name}.jpg`, mime: 'image/jpeg', sizeBytes: 100 }
}

test('createRecommendation inserts the place, photos (ordered), and tag joins', async () => {
  const authorId = await insertAuthor()
  const [restaurant, cove] = await tagIds('restaurant', 'cove')
  const result = await createRecommendation({
    authorId,
    title: 'Grytan',
    description: 'Calm anchorage',
    lat: 38.7,
    lng: 20.65,
    tagIds: [restaurant, cove],
    photos: [photo('a'), photo('b')],
  })
  expect(result.id).toBeTypeOf('string')
  expect(result.photoFileIds.length).toBe(2)

  const photos = await db
    .select({ fileId: recommendationPhoto.fileId, sortOrder: recommendationPhoto.sortOrder })
    .from(recommendationPhoto)
    .where(eq(recommendationPhoto.recommendationId, result.id))
  expect(photos.map((p) => p.sortOrder).sort((a, b) => a - b)).toEqual([0, 1])
  const sorted = [...photos].sort((a, b) => a.sortOrder - b.sortOrder)
  expect(result.photoFileIds).toEqual(sorted.map((p) => p.fileId))

  const fileRows = await db
    .select({ access: file.access, ownerId: file.ownerId })
    .from(file)
    .where(inArray(file.id, result.photoFileIds))
  expect(fileRows.length).toBe(2)
  for (const row of fileRows) {
    expect(row.access).toBe('public')
    expect(row.ownerId).toBe(authorId)
  }

  const joins = await db
    .select()
    .from(recommendationTag)
    .where(eq(recommendationTag.recommendationId, result.id))
  expect(joins.length).toBe(2)
})

test('createRecommendation rejects zero photos with NO_PHOTOS', async () => {
  const authorId = await insertAuthor()
  await expect(
    createRecommendation({ authorId, title: 'X', lat: 0, lng: 0, tagIds: [], photos: [] }),
  ).rejects.toMatchObject({ name: 'RecommendationDomainError', code: 'NO_PHOTOS' })
})

test('createRecommendation rejects more than MAX_PHOTOS with TOO_MANY_PHOTOS', async () => {
  const authorId = await insertAuthor()
  const photos = Array.from({ length: 11 }, (_, i) => photo(`p${i}`))
  await expect(
    createRecommendation({ authorId, title: 'X', lat: 0, lng: 0, tagIds: [], photos }),
  ).rejects.toMatchObject({ name: 'RecommendationDomainError', code: 'TOO_MANY_PHOTOS' })
})

test('listRecommendations returns active places with ordered photos and tagIds', async () => {
  const authorId = await insertAuthor()
  const [restaurant] = await tagIds('restaurant')
  const { id } = await createRecommendation({
    authorId,
    title: 'Grytan',
    lat: 38.7,
    lng: 20.65,
    tagIds: [restaurant],
    photos: [photo('a'), photo('b')],
  })
  const list = await listRecommendations()
  const item = list.find((r) => r.id === id)!
  expect(item.title).toBe('Grytan')
  expect(item.authorName).toBeTypeOf('string')
  expect(item.photos.map((p) => p.sortOrder)).toEqual([0, 1])
  expect(item.tagIds).toEqual([restaurant])
})

test('findRecommendation throws NOT_FOUND for an unknown id', async () => {
  await expect(findRecommendation('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
    name: 'RecommendationDomainError',
    code: 'NOT_FOUND',
  })
})

test('findRecommendation throws NOT_FOUND for a soft-deleted id and listRecommendations excludes it', async () => {
  const authorId = await insertAuthor('bob@test.oceanview.local')
  const [restaurant] = await tagIds('restaurant')
  const { id } = await createRecommendation({
    authorId,
    title: 'Soft Delete Place',
    lat: 59.0,
    lng: 18.0,
    tagIds: [restaurant],
    photos: [photo('sd')],
  })

  await db.update(recommendation).set({ deletedAt: new Date() }).where(eq(recommendation.id, id))

  await expect(findRecommendation(id)).rejects.toMatchObject({
    name: 'RecommendationDomainError',
    code: 'NOT_FOUND',
  })

  const list = await listRecommendations()
  expect(list.find((r) => r.id === id)).toBeUndefined()
})

test('updateRecommendation lets the author edit and replaces tags', async () => {
  const authorId = await insertAuthor()
  const [restaurant, cove, beach] = await tagIds('restaurant', 'cove', 'beach')
  const { id } = await createRecommendation({
    authorId,
    title: 'Old',
    lat: 38.7,
    lng: 20.65,
    tagIds: [restaurant, cove],
    photos: [photo('a')],
  })
  await updateRecommendation({
    id,
    actorId: authorId,
    actorRole: 'user',
    title: 'New',
    lat: 38.7,
    lng: 20.65,
    tagIds: [beach],
  })
  const item = await findRecommendation(id)
  expect(item.title).toBe('New')
  expect(item.tagIds).toEqual([beach])
})

test("updateRecommendation lets an admin edit someone else's place", async () => {
  const authorId = await insertAuthor('owner@test.oceanview.local')
  const adminId = await insertAuthor('admin@test.oceanview.local', 'admin')
  const { id } = await createRecommendation({
    authorId,
    title: 'Old',
    lat: 0,
    lng: 0,
    tagIds: [],
    photos: [photo('a')],
  })
  await updateRecommendation({
    id,
    actorId: adminId,
    actorRole: 'admin',
    title: 'Admin edit',
    lat: 0,
    lng: 0,
    tagIds: [],
  })
  expect((await findRecommendation(id)).title).toBe('Admin edit')
})

test('updateRecommendation blocks a non-owner non-admin', async () => {
  const authorId = await insertAuthor('owner@test.oceanview.local')
  const otherId = await insertAuthor('bob@test.oceanview.local')
  const { id } = await createRecommendation({
    authorId,
    title: 'Old',
    lat: 0,
    lng: 0,
    tagIds: [],
    photos: [photo('a')],
  })
  await expect(
    updateRecommendation({
      id,
      actorId: otherId,
      actorRole: 'user',
      title: 'X',
      lat: 0,
      lng: 0,
      tagIds: [],
    }),
  ).rejects.toMatchObject({
    name: 'RecommendationDomainError',
    code: 'CANNOT_EDIT_OTHERS_RECOMMENDATION',
  })
})

test('listRecommendations does not cross-contaminate photos or tags between recommendations', async () => {
  const authorA = await insertAuthor('carol@test.oceanview.local')
  const authorB = await insertAuthor('dave@test.oceanview.local')
  const [restaurant, cove] = await tagIds('restaurant', 'cove')

  const { id: idA } = await createRecommendation({
    authorId: authorA,
    title: 'Place A',
    lat: 60.0,
    lng: 25.0,
    tagIds: [restaurant],
    photos: [photo('a1'), photo('a2')],
  })
  const { id: idB } = await createRecommendation({
    authorId: authorB,
    title: 'Place B',
    lat: 61.0,
    lng: 26.0,
    tagIds: [cove],
    photos: [photo('b1')],
  })

  const list = await listRecommendations()
  const itemA = list.find((r) => r.id === idA)!
  const itemB = list.find((r) => r.id === idB)!

  expect(itemA.photos.length).toBe(2)
  expect(itemA.tagIds).toEqual([restaurant])

  expect(itemB.photos.length).toBe(1)
  expect(itemB.tagIds).toEqual([cove])
})

async function photoIdsFor(id: string) {
  const rows = await db
    .select({ id: recommendationPhoto.id, sortOrder: recommendationPhoto.sortOrder })
    .from(recommendationPhoto)
    .where(eq(recommendationPhoto.recommendationId, id))
  return rows.sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.id)
}

test('reorderPhotos rewrites sort_order for the author', async () => {
  const authorId = await insertAuthor()
  const { id } = await createRecommendation({
    authorId,
    title: 'G',
    lat: 0,
    lng: 0,
    tagIds: [],
    photos: [photo('a'), photo('b'), photo('c')],
  })
  const [p0, p1, p2] = await photoIdsFor(id)
  await reorderPhotos({ id, actorId: authorId, actorRole: 'user', orderedPhotoIds: [p2, p0, p1] })
  expect(await photoIdsFor(id)).toEqual([p2, p0, p1])
})

test('reorderPhotos blocks a non-owner non-admin', async () => {
  const authorId = await insertAuthor('owner@test.oceanview.local')
  const otherId = await insertAuthor('bob@test.oceanview.local')
  const { id } = await createRecommendation({
    authorId,
    title: 'G',
    lat: 0,
    lng: 0,
    tagIds: [],
    photos: [photo('a'), photo('b')],
  })
  const ids = await photoIdsFor(id)
  await expect(
    reorderPhotos({ id, actorId: otherId, actorRole: 'user', orderedPhotoIds: ids }),
  ).rejects.toMatchObject({
    name: 'RecommendationDomainError',
    code: 'CANNOT_EDIT_OTHERS_RECOMMENDATION',
  })
})

test('softDeleteRecommendation hides the place and soft-deletes its files (author)', async () => {
  const authorId = await insertAuthor()
  const { id, photoFileIds } = await createRecommendation({
    authorId,
    title: 'G',
    lat: 0,
    lng: 0,
    tagIds: [],
    photos: [photo('a')],
  })
  await softDeleteRecommendation({ id, actorId: authorId, actorRole: 'user' })
  expect((await listRecommendations()).find((r) => r.id === id)).toBeUndefined()
  const [f] = await db
    .select({ deletedAt: file.deletedAt })
    .from(file)
    .where(eq(file.id, photoFileIds[0]))
  expect(f.deletedAt).not.toBeNull()
})

test('softDeleteRecommendation blocks a non-owner non-admin', async () => {
  const authorId = await insertAuthor('owner@test.oceanview.local')
  const otherId = await insertAuthor('bob@test.oceanview.local')
  const { id } = await createRecommendation({
    authorId,
    title: 'G',
    lat: 0,
    lng: 0,
    tagIds: [],
    photos: [photo('a')],
  })
  await expect(
    softDeleteRecommendation({ id, actorId: otherId, actorRole: 'user' }),
  ).rejects.toMatchObject({
    name: 'RecommendationDomainError',
    code: 'CANNOT_DELETE_OTHERS_RECOMMENDATION',
  })
})
