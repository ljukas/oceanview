import { eq } from 'drizzle-orm'
import { beforeEach, expect, test } from 'vitest'
import { db } from '~/lib/db'
import { user } from '~/lib/db/schema'
import { truncateAll } from '../../../test/setup'
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

beforeEach(async () => {
  await truncateAll()
})

test('findIdByEmail returns null when no user has that email', async () => {
  expect(await findIdByEmail('ghost@example.com')).toBeNull()
})

test('findIdByEmail returns the id when a user with that email exists', async () => {
  await db.insert(user).values({
    id: 'u-alice',
    name: 'Alice',
    email: 'alice@example.com',
  })
  expect(await findIdByEmail('alice@example.com')).toBe('u-alice')
})

test('setAdmin promotes only the target user', async () => {
  await db.insert(user).values([
    { id: 'u-alice', name: 'Alice', email: 'alice@example.com' },
    { id: 'u-bob', name: 'Bob', email: 'bob@example.com' },
  ])

  await setAdmin('u-alice')

  const [alice] = await db.select({ role: user.role }).from(user).where(eq(user.id, 'u-alice'))
  const [bob] = await db.select({ role: user.role }).from(user).where(eq(user.id, 'u-bob'))

  expect(alice?.role).toBe('admin')
  expect(bob?.role).toBeNull()
})

test('listAll returns active users ordered by name', async () => {
  await db.insert(user).values([
    { id: 'u-bob', name: 'Bob', email: 'bob@example.com', role: 'user' },
    { id: 'u-alice', name: 'Alice', email: 'alice@example.com', role: 'admin' },
  ])

  const rows = await listAll()

  expect(rows.map((r) => r.name)).toEqual(['Alice', 'Bob'])
})

test('listAll excludes soft-deleted users', async () => {
  await db.insert(user).values([
    { id: 'u-alice', name: 'Alice', email: 'alice@example.com' },
    {
      id: 'u-old',
      name: 'Old Member',
      email: 'old@example.com',
      deletedAt: new Date('2020-01-01'),
    },
  ])

  const rows = await listAll()

  expect(rows.map((r) => r.id)).toEqual(['u-alice'])
})

test('listDeleted returns only soft-deleted users, newest first', async () => {
  await db.insert(user).values([
    { id: 'u-alice', name: 'Alice', email: 'alice@example.com' },
    {
      id: 'u-older',
      name: 'Older',
      email: 'older@example.com',
      deletedAt: new Date('2020-01-01'),
    },
    {
      id: 'u-newer',
      name: 'Newer',
      email: 'newer@example.com',
      deletedAt: new Date('2025-06-01'),
    },
  ])

  const rows = await listDeleted()

  expect(rows.map((r) => r.id)).toEqual(['u-newer', 'u-older'])
})

test('findById returns soft-deleted users (callers need them for guards)', async () => {
  await db.insert(user).values({
    id: 'u-old',
    name: 'Old',
    email: 'old@example.com',
    deletedAt: new Date('2020-01-01'),
  })

  const row = await findById('u-old')

  expect(row?.id).toBe('u-old')
  expect(row?.deletedAt).not.toBeNull()
})

test('findById returns null for an unknown id', async () => {
  expect(await findById('nope')).toBeNull()
})

test('createUser inserts a row with the provided fields', async () => {
  const created = await createUser({
    id: 'u-new',
    name: 'Anna Svensson',
    email: 'anna@example.com',
    phone: '070-111 22 33',
    role: 'user',
  })

  expect(created).toMatchObject({
    id: 'u-new',
    name: 'Anna Svensson',
    email: 'anna@example.com',
    phone: '070-111 22 33',
    role: 'user',
    deletedAt: null,
  })
})

test('updateUser patches only the provided fields', async () => {
  await db.insert(user).values({
    id: 'u-alice',
    name: 'Alice',
    email: 'alice@example.com',
    phone: '111',
    role: 'user',
  })

  const updated = await updateUser('u-alice', {
    name: 'Alice Updated',
    role: 'admin',
  })

  expect(updated.name).toBe('Alice Updated')
  expect(updated.role).toBe('admin')
  expect(updated.email).toBe('alice@example.com')
  expect(updated.phone).toBe('111')
})

test('softDeleteUser sets deletedAt and leaves the row intact', async () => {
  await db.insert(user).values({
    id: 'u-alice',
    name: 'Alice',
    email: 'alice@example.com',
  })

  await softDeleteUser('u-alice')

  const [row] = await db
    .select({ id: user.id, deletedAt: user.deletedAt })
    .from(user)
    .where(eq(user.id, 'u-alice'))

  expect(row?.id).toBe('u-alice')
  expect(row?.deletedAt).toBeInstanceOf(Date)
})

test('countAdmins counts only active admins', async () => {
  await db.insert(user).values([
    { id: 'a1', name: 'A1', email: 'a1@example.com', role: 'admin' },
    { id: 'a2', name: 'A2', email: 'a2@example.com', role: 'admin' },
    {
      id: 'a3',
      name: 'A3',
      email: 'a3@example.com',
      role: 'admin',
      deletedAt: new Date(),
    },
    { id: 'u1', name: 'U1', email: 'u1@example.com', role: 'user' },
  ])

  expect(await countAdmins()).toBe(2)
})
