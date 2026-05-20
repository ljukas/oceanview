import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { db } from '~/lib/db'
import { user } from '~/lib/db/schema'
import {
  countAdmins,
  createUser,
  findById,
  findIdByEmail,
  listAll,
  listDeleted,
  setAdmin,
  softDeleteUser,
  updateUser,
} from './user'

test('findIdByEmail returns null when no user has that email', async () => {
  expect(await findIdByEmail('ghost@test.oceanview.local')).toBeNull()
})

test('findIdByEmail returns the id when a user with that email exists', async () => {
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({ name: 'Alice', email: 'alice@test.oceanview.local' })
    .returning({ id: user.id })

  expect(await findIdByEmail('alice@test.oceanview.local')).toBe(aliceId)
})

test('setAdmin promotes only the target user', async () => {
  const [{ id: aliceId }, { id: bobId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      { name: 'Bob', email: 'bob@test.oceanview.local' },
    ])
    .returning({ id: user.id })

  await setAdmin(aliceId)

  const [alice] = await db.select({ role: user.role }).from(user).where(eq(user.id, aliceId))
  const [bob] = await db.select({ role: user.role }).from(user).where(eq(user.id, bobId))

  expect(alice?.role).toBe('admin')
  expect(bob?.role).toBeNull()
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

test('findById returns soft-deleted users (callers need them for guards)', async () => {
  const [{ id: oldId }] = await db
    .insert(user)
    .values({
      name: 'Old',
      email: 'old@test.oceanview.local',
      deletedAt: new Date('2020-01-01'),
    })
    .returning({ id: user.id })

  const row = await findById(oldId)

  expect(row?.id).toBe(oldId)
  expect(row?.deletedAt).not.toBeNull()
})

test('findById returns null for an unknown id', async () => {
  expect(await findById(randomUUID())).toBeNull()
})

test('createUser inserts a row with the provided fields', async () => {
  const created = await createUser({
    name: 'Anna Svensson',
    email: 'anna@test.oceanview.local',
    phone: '070-111 22 33',
    role: 'user',
  })

  expect(created).toMatchObject({
    name: 'Anna Svensson',
    email: 'anna@test.oceanview.local',
    phone: '070-111 22 33',
    role: 'user',
    deletedAt: null,
  })
  expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

test('updateUser patches only the provided fields', async () => {
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({
      name: 'Alice',
      email: 'alice@test.oceanview.local',
      phone: '111',
      role: 'user',
    })
    .returning({ id: user.id })

  const updated = await updateUser(aliceId, {
    name: 'Alice Updated',
    role: 'admin',
  })

  expect(updated.name).toBe('Alice Updated')
  expect(updated.role).toBe('admin')
  expect(updated.email).toBe('alice@test.oceanview.local')
  expect(updated.phone).toBe('111')
})

test('softDeleteUser sets deletedAt and leaves the row intact', async () => {
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({
      name: 'Alice',
      email: 'alice@test.oceanview.local',
    })
    .returning({ id: user.id })

  await softDeleteUser(aliceId)

  const [row] = await db
    .select({ id: user.id, deletedAt: user.deletedAt })
    .from(user)
    .where(eq(user.id, aliceId))

  expect(row?.id).toBe(aliceId)
  expect(row?.deletedAt).toBeInstanceOf(Date)
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
