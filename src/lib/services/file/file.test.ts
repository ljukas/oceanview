import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { db } from '~/lib/db'
import { file, user } from '~/lib/db/schema'
import { setupDatabase } from '~test/setup'
import { FileDomainError } from './errors'
import {
  confirmUpload,
  findActiveById,
  findById,
  listAllDocuments,
  replaceAvatarForUser,
  setBlurhash,
  softDelete,
} from './file'

setupDatabase()

async function insertMember(email: string, name = email, role: 'user' | 'admin' = 'user') {
  const [row] = await db.insert(user).values({ name, email, role }).returning({ id: user.id })
  return row.id
}

test('confirmUpload inserts a row and returns it', async () => {
  const ownerId = await insertMember('anna@test.oceanview.local', 'Anna')
  const row = await confirmUpload({
    ownerId,
    pathname: 'dev/documents/manual.pdf',
    name: 'manual.pdf',
    mime: 'application/pdf',
    sizeBytes: 12345,
    access: 'private',
  })
  expect(row.id).toBeTypeOf('string')
  expect(row.ownerId).toBe(ownerId)
  expect(row.access).toBe('private')
})

test('listAllDocuments returns only non-deleted private rows, joined with owner name', async () => {
  const aliceId = await insertMember('alice@test.oceanview.local', 'Alice')
  const bobId = await insertMember('bob@test.oceanview.local', 'Bob')
  await confirmUpload({
    ownerId: aliceId,
    pathname: 'dev/documents/alice.pdf',
    name: 'alice.pdf',
    mime: 'application/pdf',
    sizeBytes: 100,
    access: 'private',
  })
  await confirmUpload({
    ownerId: bobId,
    pathname: 'dev/avatars/bob',
    name: 'bob.jpg',
    mime: 'image/jpeg',
    sizeBytes: 200,
    access: 'public',
  })
  const docs = await listAllDocuments()
  expect(docs.map((d) => d.name)).toEqual(['alice.pdf'])
  expect(docs[0].ownerName).toBe('Alice')
})

test('listAllDocuments hides soft-deleted documents', async () => {
  const ownerId = await insertMember('anna@test.oceanview.local', 'Anna')
  const inserted = await confirmUpload({
    ownerId,
    pathname: 'dev/documents/old.pdf',
    name: 'old.pdf',
    mime: 'application/pdf',
    sizeBytes: 50,
    access: 'private',
  })
  await db.update(file).set({ deletedAt: new Date() }).where(eq(file.id, inserted.id))
  expect(await listAllDocuments()).toEqual([])
})

test('replaceAvatarForUser inserts new public row and soft-deletes previous public rows', async () => {
  const userId = await insertMember('anna@test.oceanview.local', 'Anna')
  const first = await confirmUpload({
    ownerId: userId,
    pathname: 'dev/avatars/anna-v1',
    name: 'anna-v1.jpg',
    mime: 'image/jpeg',
    sizeBytes: 100,
    access: 'public',
  })
  const result = await replaceAvatarForUser({
    userId,
    newRow: {
      pathname: 'dev/avatars/anna-v2',
      name: 'anna-v2.jpg',
      mime: 'image/jpeg',
      sizeBytes: 150,
    },
  })
  expect(result.previousPathnames).toEqual([first.pathname])
  expect(result.newRow.pathname).toBe('dev/avatars/anna-v2')

  const oldRow = await findById(first.id)
  expect(oldRow?.deletedAt).not.toBeNull()
})

test('replaceAvatarForUser returns empty previousPathnames when no prior avatar exists', async () => {
  const userId = await insertMember('anna@test.oceanview.local', 'Anna')
  const result = await replaceAvatarForUser({
    userId,
    newRow: {
      pathname: 'dev/avatars/anna-fresh',
      name: 'anna.jpg',
      mime: 'image/jpeg',
      sizeBytes: 80,
    },
  })
  expect(result.previousPathnames).toEqual([])
  expect(result.newRow.access).toBe('public')
})

test('softDelete by the owner soft-deletes a private file', async () => {
  const ownerId = await insertMember('anna@test.oceanview.local', 'Anna')
  const row = await confirmUpload({
    ownerId,
    pathname: 'dev/documents/notes.pdf',
    name: 'notes.pdf',
    mime: 'application/pdf',
    sizeBytes: 100,
    access: 'private',
  })
  const deleted = await softDelete({
    id: row.id,
    actingUserId: ownerId,
    actingUserRole: 'user',
  })
  expect(deleted.deletedAt).not.toBeNull()
  expect(await findActiveById(row.id)).toBeNull()
})

test('softDelete by another non-admin user raises CANNOT_DELETE_OTHERS_FILE', async () => {
  const ownerId = await insertMember('anna@test.oceanview.local', 'Anna')
  const otherId = await insertMember('bob@test.oceanview.local', 'Bob')
  const row = await confirmUpload({
    ownerId,
    pathname: 'dev/documents/notes.pdf',
    name: 'notes.pdf',
    mime: 'application/pdf',
    sizeBytes: 100,
    access: 'private',
  })
  await expect(
    softDelete({ id: row.id, actingUserId: otherId, actingUserRole: 'user' }),
  ).rejects.toThrow(FileDomainError)
})

test("softDelete by an admin succeeds even on another user's file", async () => {
  const ownerId = await insertMember('anna@test.oceanview.local', 'Anna')
  const adminId = await insertMember('admin@test.oceanview.local', 'Admin', 'admin')
  const row = await confirmUpload({
    ownerId,
    pathname: 'dev/documents/notes.pdf',
    name: 'notes.pdf',
    mime: 'application/pdf',
    sizeBytes: 100,
    access: 'private',
  })
  const deleted = await softDelete({
    id: row.id,
    actingUserId: adminId,
    actingUserRole: 'admin',
  })
  expect(deleted.deletedAt).not.toBeNull()
})

test('softDelete on a public (avatar) file raises CANNOT_DELETE_AVATAR_VIA_DOCUMENT_DELETE', async () => {
  const ownerId = await insertMember('anna@test.oceanview.local', 'Anna')
  const row = await confirmUpload({
    ownerId,
    pathname: 'dev/avatars/anna',
    name: 'anna.jpg',
    mime: 'image/jpeg',
    sizeBytes: 100,
    access: 'public',
  })
  await expect(
    softDelete({ id: row.id, actingUserId: ownerId, actingUserRole: 'user' }),
  ).rejects.toThrow(FileDomainError)
})

test('setBlurhash writes the hash to an active row', async () => {
  const ownerId = await insertMember('anna@test.oceanview.local', 'Anna')
  const row = await confirmUpload({
    ownerId,
    pathname: 'dev/documents/photo.png',
    name: 'photo.png',
    mime: 'image/png',
    sizeBytes: 100,
    access: 'private',
  })
  expect(row.blurhash).toBeNull()
  await setBlurhash({ fileId: row.id, blurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH' })
  const after = await findById(row.id)
  expect(after?.blurhash).toBe('LKO2?U%2Tw=w]~RBVZRi};RPxuwH')
})

test('setBlurhash leaves soft-deleted rows untouched', async () => {
  const ownerId = await insertMember('anna@test.oceanview.local', 'Anna')
  const row = await confirmUpload({
    ownerId,
    pathname: 'dev/documents/old.png',
    name: 'old.png',
    mime: 'image/png',
    sizeBytes: 100,
    access: 'private',
  })
  await db.update(file).set({ deletedAt: new Date() }).where(eq(file.id, row.id))
  await setBlurhash({ fileId: row.id, blurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH' })
  const after = await findById(row.id)
  expect(after?.blurhash).toBeNull()
})

test('softDelete on a missing file raises NOT_FOUND', async () => {
  const adminId = await insertMember('admin@test.oceanview.local', 'Admin', 'admin')
  await expect(
    softDelete({
      id: '00000000-0000-0000-0000-000000000000',
      actingUserId: adminId,
      actingUserRole: 'admin',
    }),
  ).rejects.toThrow(FileDomainError)
})
