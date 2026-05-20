import { eq } from 'drizzle-orm'
import { beforeEach, expect, test } from 'vitest'
import { db } from '~/lib/db'
import { user } from '~/lib/db/schema'
import { newScope, type TestScope } from '../../../test/scope'
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

let scope: TestScope

beforeEach(() => {
  scope = newScope()
})

test('findIdByEmail returns null when no user has that email', async () => {
  expect(await findIdByEmail(scope.email('ghost'))).toBeNull()
})

test('findIdByEmail returns the id when a user with that email exists', async () => {
  const aliceId = scope.user('alice')
  await db.insert(user).values({
    id: aliceId,
    name: 'Alice',
    email: scope.email('alice'),
  })
  expect(await findIdByEmail(scope.email('alice'))).toBe(aliceId)
})

test('setAdmin promotes only the target user', async () => {
  const aliceId = scope.user('alice')
  const bobId = scope.user('bob')
  await db.insert(user).values([
    { id: aliceId, name: 'Alice', email: scope.email('alice') },
    { id: bobId, name: 'Bob', email: scope.email('bob') },
  ])

  await setAdmin(aliceId)

  const [alice] = await db.select({ role: user.role }).from(user).where(eq(user.id, aliceId))
  const [bob] = await db.select({ role: user.role }).from(user).where(eq(user.id, bobId))

  expect(alice?.role).toBe('admin')
  expect(bob?.role).toBeNull()
})

test('listAll returns active users ordered by name', async () => {
  const aliceId = scope.user('alice')
  const bobId = scope.user('bob')
  await db.insert(user).values([
    { id: bobId, name: 'Bob', email: scope.email('bob'), role: 'user' },
    { id: aliceId, name: 'Alice', email: scope.email('alice'), role: 'admin' },
  ])

  const mine = (await listAll()).filter((r) => r.id === aliceId || r.id === bobId)

  expect(mine.map((r) => r.name)).toEqual(['Alice', 'Bob'])
})

test('listAll excludes soft-deleted users', async () => {
  const aliceId = scope.user('alice')
  const oldId = scope.user('old')
  await db.insert(user).values([
    { id: aliceId, name: 'Alice', email: scope.email('alice') },
    {
      id: oldId,
      name: 'Old Member',
      email: scope.email('old'),
      deletedAt: new Date('2020-01-01'),
    },
  ])

  const mine = (await listAll()).filter((r) => r.id === aliceId || r.id === oldId)

  expect(mine.map((r) => r.id)).toEqual([aliceId])
})

test('listDeleted returns only soft-deleted users, newest first', async () => {
  const aliceId = scope.user('alice')
  const olderId = scope.user('older')
  const newerId = scope.user('newer')
  await db.insert(user).values([
    { id: aliceId, name: 'Alice', email: scope.email('alice') },
    {
      id: olderId,
      name: 'Older',
      email: scope.email('older'),
      deletedAt: new Date('2020-01-01'),
    },
    {
      id: newerId,
      name: 'Newer',
      email: scope.email('newer'),
      deletedAt: new Date('2025-06-01'),
    },
  ])

  const mine = (await listDeleted()).filter(
    (r) => r.id === aliceId || r.id === olderId || r.id === newerId,
  )

  expect(mine.map((r) => r.id)).toEqual([newerId, olderId])
})

test('findById returns soft-deleted users (callers need them for guards)', async () => {
  const oldId = scope.user('old')
  await db.insert(user).values({
    id: oldId,
    name: 'Old',
    email: scope.email('old'),
    deletedAt: new Date('2020-01-01'),
  })

  const row = await findById(oldId)

  expect(row?.id).toBe(oldId)
  expect(row?.deletedAt).not.toBeNull()
})

test('findById returns null for an unknown id', async () => {
  expect(await findById(scope.user('nope'))).toBeNull()
})

test('createUser inserts a row with the provided fields', async () => {
  const newId = scope.user('new')
  const created = await createUser({
    id: newId,
    name: 'Anna Svensson',
    email: scope.email('anna'),
    phone: '070-111 22 33',
    role: 'user',
  })

  expect(created).toMatchObject({
    id: newId,
    name: 'Anna Svensson',
    email: scope.email('anna'),
    phone: '070-111 22 33',
    role: 'user',
    deletedAt: null,
  })
})

test('updateUser patches only the provided fields', async () => {
  const aliceId = scope.user('alice')
  await db.insert(user).values({
    id: aliceId,
    name: 'Alice',
    email: scope.email('alice'),
    phone: '111',
    role: 'user',
  })

  const updated = await updateUser(aliceId, {
    name: 'Alice Updated',
    role: 'admin',
  })

  expect(updated.name).toBe('Alice Updated')
  expect(updated.role).toBe('admin')
  expect(updated.email).toBe(scope.email('alice'))
  expect(updated.phone).toBe('111')
})

test('softDeleteUser sets deletedAt and leaves the row intact', async () => {
  const aliceId = scope.user('alice')
  await db.insert(user).values({
    id: aliceId,
    name: 'Alice',
    email: scope.email('alice'),
  })

  await softDeleteUser(aliceId)

  const [row] = await db
    .select({ id: user.id, deletedAt: user.deletedAt })
    .from(user)
    .where(eq(user.id, aliceId))

  expect(row?.id).toBe(aliceId)
  expect(row?.deletedAt).toBeInstanceOf(Date)
})

test('countAdmins counts only active admins', async () => {
  const before = await countAdmins()
  await db.insert(user).values([
    { id: scope.user('a1'), name: 'A1', email: scope.email('a1'), role: 'admin' },
    { id: scope.user('a2'), name: 'A2', email: scope.email('a2'), role: 'admin' },
    {
      id: scope.user('a3'),
      name: 'A3',
      email: scope.email('a3'),
      role: 'admin',
      deletedAt: new Date(),
    },
    { id: scope.user('u1'), name: 'U1', email: scope.email('u1'), role: 'user' },
  ])

  expect(await countAdmins()).toBe(before + 2)
})
