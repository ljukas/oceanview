import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { db } from '~/lib/db'
import { user } from '~/lib/db/schema'
import { setupDatabase } from '~test/setup'
import { UserDomainError } from './errors'
import {
  countAdmins,
  createAsAdmin,
  findActiveById,
  findAvatarByEmail,
  findIdByEmail,
  findRowById,
  listAll,
  listDeleted,
  restoreAsAdmin,
  softDeleteAsAdmin,
  updateAsAdmin,
} from './user'

setupDatabase()

const standardInput = {
  name: 'Anna Svensson',
  email: 'anna@test.oceanview.local',
  phone: '070-111 22 33',
  role: 'user' as const,
}

async function insertAdmin(email: string, name = email) {
  const [row] = await db
    .insert(user)
    .values({ name, email, role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

async function insertMember(email: string, name = email) {
  const [row] = await db
    .insert(user)
    .values({ name, email, role: 'user' })
    .returning({ id: user.id })
  return row.id
}

// ---------- read helpers ----------

test('findIdByEmail returns null when no user has that email', async () => {
  expect(await findIdByEmail('ghost@test.oceanview.local')).toBeNull()
})

test('findIdByEmail returns the id when a user with that email exists', async () => {
  const aliceId = await insertMember('alice@test.oceanview.local', 'Alice')
  expect(await findIdByEmail('alice@test.oceanview.local')).toBe(aliceId)
})

test('findAvatarByEmail returns the avatar for a user with an image', async () => {
  await db.insert(user).values({
    name: 'Alice',
    email: 'alice@test.oceanview.local',
    image: 'https://example.com/avatar.webp',
    imageBlurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
  })
  expect(await findAvatarByEmail('alice@test.oceanview.local')).toEqual({
    image: 'https://example.com/avatar.webp',
    imageBlurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
  })
})

test('findAvatarByEmail returns all-null for an unknown email', async () => {
  expect(await findAvatarByEmail('ghost@test.oceanview.local')).toEqual({
    image: null,
    imageBlurhash: null,
  })
})

test('findAvatarByEmail returns all-null for a soft-deleted user', async () => {
  await db.insert(user).values({
    name: 'Old',
    email: 'old@test.oceanview.local',
    image: 'https://example.com/avatar.webp',
    deletedAt: new Date('2020-01-01'),
  })
  expect(await findAvatarByEmail('old@test.oceanview.local')).toEqual({
    image: null,
    imageBlurhash: null,
  })
})

test('listAll returns active users ordered by name', async () => {
  await db.insert(user).values([
    { name: 'Bob', email: 'bob@test.oceanview.local', role: 'user' },
    { name: 'Alice', email: 'alice@test.oceanview.local', role: 'admin' },
  ])
  expect((await listAll()).map((r) => r.name)).toEqual(['Alice', 'Bob'])
})

test('listAll excludes soft-deleted users', async () => {
  const [{ id: aliceId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      {
        name: 'Old Member',
        email: 'old@test.oceanview.local',
        deletedAt: new Date('2020-01-01'),
      },
    ])
    .returning({ id: user.id })
  expect((await listAll()).map((r) => r.id)).toEqual([aliceId])
})

test('listDeleted returns only soft-deleted users, newest first', async () => {
  const [, { id: olderId }, { id: newerId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      {
        name: 'Older',
        email: 'older@test.oceanview.local',
        deletedAt: new Date('2020-01-01'),
      },
      {
        name: 'Newer',
        email: 'newer@test.oceanview.local',
        deletedAt: new Date('2025-06-01'),
      },
    ])
    .returning({ id: user.id })
  expect((await listDeleted()).map((r) => r.id)).toEqual([newerId, olderId])
})

test('findRowById returns soft-deleted users for restore flows', async () => {
  const [{ id: oldId }] = await db
    .insert(user)
    .values({
      name: 'Old',
      email: 'old@test.oceanview.local',
      deletedAt: new Date('2020-01-01'),
    })
    .returning({ id: user.id })

  const row = await findRowById(oldId)
  expect(row?.id).toBe(oldId)
  expect(row?.deletedAt).not.toBeNull()
})

test('findRowById returns null for an unknown id', async () => {
  expect(await findRowById(randomUUID())).toBeNull()
})

test('findActiveById hides soft-deleted users', async () => {
  const [{ id: oldId }] = await db
    .insert(user)
    .values({
      name: 'Old',
      email: 'old@test.oceanview.local',
      deletedAt: new Date('2020-01-01'),
    })
    .returning({ id: user.id })

  expect(await findActiveById(oldId)).toBeNull()
})

test('findActiveById returns active users', async () => {
  const aliceId = await insertMember('alice@test.oceanview.local', 'Alice')
  const row = await findActiveById(aliceId)
  expect(row?.id).toBe(aliceId)
})

test('countAdmins counts only active admins', async () => {
  await db.insert(user).values([
    { name: 'A1', email: 'a1@test.oceanview.local', role: 'admin' },
    { name: 'A2', email: 'a2@test.oceanview.local', role: 'admin' },
    {
      name: 'A3',
      email: 'a3@test.oceanview.local',
      role: 'admin',
      deletedAt: new Date(),
    },
    { name: 'U1', email: 'u1@test.oceanview.local', role: 'user' },
  ])
  expect(await countAdmins()).toBe(2)
})

// ---------- createAsAdmin ----------

test('createAsAdmin inserts a row with the provided fields', async () => {
  const created = await createAsAdmin(standardInput)
  expect(created).toMatchObject({ ...standardInput, deletedAt: null })
  expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

// ---------- updateAsAdmin ----------

test('updateAsAdmin patches the target and returns the updated row', async () => {
  const adminId = await insertAdmin('admin@test.oceanview.local', 'Admin')
  const aliceId = await insertMember('alice@test.oceanview.local', 'Alice')

  const updated = await updateAsAdmin(adminId, aliceId, {
    name: 'Alice Updated',
    email: 'alice@test.oceanview.local',
    phone: '111',
    role: 'admin',
  })

  expect(updated.name).toBe('Alice Updated')
  expect(updated.role).toBe('admin')
  expect(updated.phone).toBe('111')
})

test('updateAsAdmin throws NOT_FOUND when target does not exist', async () => {
  const adminId = await insertAdmin('admin@test.oceanview.local', 'Admin')
  await expect(
    updateAsAdmin(adminId, randomUUID(), { ...standardInput, role: 'admin' }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

test('updateAsAdmin throws TARGET_DELETED when target is soft-deleted', async () => {
  const adminId = await insertAdmin('admin@test.oceanview.local', 'Admin')
  const [{ id: deletedId }] = await db
    .insert(user)
    .values({
      name: 'Deleted',
      email: 'deleted@test.oceanview.local',
      deletedAt: new Date(),
    })
    .returning({ id: user.id })

  await expect(
    updateAsAdmin(adminId, deletedId, { ...standardInput, role: 'user' }),
  ).rejects.toMatchObject({ code: 'TARGET_DELETED' })
})

test('updateAsAdmin throws CANNOT_ACT_ON_SELF when admin demotes themselves', async () => {
  const adminId = await insertAdmin('admin@test.oceanview.local', 'Admin')
  // Second admin so the LAST_ADMIN guard wouldn't trip first.
  await insertAdmin('admin2@test.oceanview.local', 'Admin2')

  await expect(
    updateAsAdmin(adminId, adminId, {
      name: 'Admin',
      email: 'admin@test.oceanview.local',
      phone: '111',
      role: 'user',
    }),
  ).rejects.toMatchObject({ code: 'CANNOT_ACT_ON_SELF' })
})

test('updateAsAdmin lets an admin update their own non-role fields', async () => {
  const adminId = await insertAdmin('admin@test.oceanview.local', 'Admin')

  const updated = await updateAsAdmin(adminId, adminId, {
    name: 'Admin Renamed',
    email: 'admin@test.oceanview.local',
    phone: '999',
    role: 'admin',
  })

  expect(updated.name).toBe('Admin Renamed')
  expect(updated.phone).toBe('999')
})

test('updateAsAdmin throws LAST_ADMIN when demoting the only admin', async () => {
  const adminId = await insertAdmin('admin@test.oceanview.local', 'Admin')
  const otherAdminId = await insertAdmin('admin2@test.oceanview.local', 'Admin2')

  // Demote the second admin directly so only one remains; guard should now block.
  await db.update(user).set({ role: 'user' }).where(eq(user.id, otherAdminId))

  await expect(
    updateAsAdmin(otherAdminId, adminId, {
      name: 'Admin',
      email: 'admin@test.oceanview.local',
      phone: '111',
      role: 'user',
    }),
  ).rejects.toMatchObject({ code: 'LAST_ADMIN' })
})

// ---------- softDeleteAsAdmin ----------

test('softDeleteAsAdmin sets deletedAt', async () => {
  const adminId = await insertAdmin('admin@test.oceanview.local', 'Admin')
  const aliceId = await insertMember('alice@test.oceanview.local', 'Alice')

  await softDeleteAsAdmin(adminId, aliceId)

  const [row] = await db
    .select({ deletedAt: user.deletedAt })
    .from(user)
    .where(eq(user.id, aliceId))
  expect(row?.deletedAt).toBeInstanceOf(Date)
})

test('softDeleteAsAdmin is idempotent on already-deleted users', async () => {
  const adminId = await insertAdmin('admin@test.oceanview.local', 'Admin')
  const [{ id: oldId }] = await db
    .insert(user)
    .values({
      name: 'Old',
      email: 'old@test.oceanview.local',
      deletedAt: new Date('2020-01-01'),
    })
    .returning({ id: user.id })

  await expect(softDeleteAsAdmin(adminId, oldId)).resolves.toBeUndefined()
})

test('softDeleteAsAdmin throws NOT_FOUND for unknown id', async () => {
  const adminId = await insertAdmin('admin@test.oceanview.local', 'Admin')
  await expect(softDeleteAsAdmin(adminId, randomUUID())).rejects.toMatchObject({
    code: 'NOT_FOUND',
  })
})

test('softDeleteAsAdmin throws CANNOT_ACT_ON_SELF when admin deletes themselves', async () => {
  const adminId = await insertAdmin('admin@test.oceanview.local', 'Admin')
  await expect(softDeleteAsAdmin(adminId, adminId)).rejects.toMatchObject({
    code: 'CANNOT_ACT_ON_SELF',
  })
})

test('softDeleteAsAdmin throws LAST_ADMIN when deleting the only admin', async () => {
  const soloAdminId = await insertAdmin('admin@test.oceanview.local', 'Admin')
  const otherAdminId = await insertAdmin('admin2@test.oceanview.local', 'Admin2')

  // Drop second admin to user so only `soloAdminId` remains.
  await db.update(user).set({ role: 'user' }).where(eq(user.id, otherAdminId))

  await expect(softDeleteAsAdmin(otherAdminId, soloAdminId)).rejects.toMatchObject({
    code: 'LAST_ADMIN',
  })
})

test('softDeleteAsAdmin allows deleting a non-admin even with only one admin', async () => {
  const adminId = await insertAdmin('admin@test.oceanview.local', 'Admin')
  const aliceId = await insertMember('alice@test.oceanview.local', 'Alice')
  await expect(softDeleteAsAdmin(adminId, aliceId)).resolves.toBeUndefined()
})

// ---------- restoreAsAdmin ----------

test('restoreAsAdmin clears deletedAt', async () => {
  const [{ id: oldId }] = await db
    .insert(user)
    .values({
      name: 'Old',
      email: 'old@test.oceanview.local',
      deletedAt: new Date('2020-01-01'),
    })
    .returning({ id: user.id })

  await restoreAsAdmin(oldId)

  const [row] = await db.select({ deletedAt: user.deletedAt }).from(user).where(eq(user.id, oldId))
  expect(row?.deletedAt).toBeNull()
})

test('restoreAsAdmin is idempotent on active users', async () => {
  const aliceId = await insertMember('alice@test.oceanview.local', 'Alice')
  await expect(restoreAsAdmin(aliceId)).resolves.toBeUndefined()
})

test('restoreAsAdmin throws NOT_FOUND for unknown id', async () => {
  await expect(restoreAsAdmin(randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

// ---------- error shape ----------

test('UserDomainError instances carry the discriminating code field', async () => {
  const adminId = await insertAdmin('admin@test.oceanview.local', 'Admin')
  try {
    await softDeleteAsAdmin(adminId, adminId)
    throw new Error('should have thrown')
  } catch (err) {
    expect(err).toBeInstanceOf(UserDomainError)
    expect((err as UserDomainError).code).toBe('CANNOT_ACT_ON_SELF')
  }
})
