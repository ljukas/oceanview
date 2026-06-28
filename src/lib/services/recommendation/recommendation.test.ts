import { eq, inArray } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { db } from '~/lib/db'
import { file, recommendationPhoto, recommendationTag, tag, user } from '~/lib/db/schema'
import { setupDatabase } from '~test/setup'
import { createRecommendation, findRecommendation, listRecommendations } from './recommendation'

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
