import { eq } from 'drizzle-orm'
import { beforeEach, expect, test } from 'vitest'
import { truncateAll } from '../../../test/setup'
import { db } from '~/lib/db'
import { user } from '~/lib/db/schema'
import { findIdByEmail, setAdmin } from './user'

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

  const [alice] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, 'u-alice'))
  const [bob] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, 'u-bob'))

  expect(alice?.role).toBe('admin')
  expect(bob?.role).toBeNull()
})
