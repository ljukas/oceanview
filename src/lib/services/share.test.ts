import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { db } from '~/lib/db'
import { ownershipAssignment, user } from '~/lib/db/schema'
import {
  assignPart,
  findPartById,
  getCurrentOwner,
  getOwnerAt,
  listAssignmentHistory,
  listAssignmentsForUser,
  listParts,
  listPartsWithCurrentOwner,
  unassignPart,
} from './share'

// Within the outer test transaction (see test/setup.ts), purge any
// pre-existing assignments for one share_part so the test has exclusive
// ownership of that part's history for its assertions. The delete is
// rolled back when the test ends, so global state is unchanged.
async function takeExclusivePart(partId: string): Promise<void> {
  await db.delete(ownershipAssignment).where(eq(ownershipAssignment.partId, partId))
}

test('listParts returns all 20 share parts in A1..J2 order', async () => {
  const parts = await listParts()
  expect(parts).toHaveLength(20)
  expect(parts[0]).toMatchObject({ id: 'A1', shareCode: 'A', partNumber: 1 })
  expect(parts[1]).toMatchObject({ id: 'A2', shareCode: 'A', partNumber: 2 })
  expect(parts[parts.length - 1]).toMatchObject({ id: 'J2', shareCode: 'J', partNumber: 2 })
})

test('findPartById returns the row when it exists and null otherwise', async () => {
  expect(await findPartById('C1')).toMatchObject({ id: 'C1', shareCode: 'C', partNumber: 1 })
  expect(await findPartById('Z9')).toBeNull()
})

test('getCurrentOwner returns null when the part has never been assigned', async () => {
  await takeExclusivePart('A1')
  expect(await getCurrentOwner('A1')).toBeNull()
})

test('assignPart creates an open assignment that becomes the current owner', async () => {
  await takeExclusivePart('A1')
  const aliceId = scope.user('alice')
  await db.insert(user).values({ id: aliceId, name: 'Alice', email: scope.email('alice') })

  const row = await assignPart({ partId: 'A1', userId: aliceId, from: new Date('2024-01-01') })

  expect(row.userId).toBe(aliceId)
  expect(row.assignedTo).toBeNull()
  expect(await getCurrentOwner('A1')).toBe(aliceId)
})

test('assignPart closes the prior open assignment on the new from date', async () => {
  await takeExclusivePart('A1')
  const aliceId = scope.user('alice')
  const bobId = scope.user('bob')
  await db.insert(user).values([
    { id: aliceId, name: 'Alice', email: scope.email('alice') },
    { id: bobId, name: 'Bob', email: scope.email('bob') },
  ])

  await assignPart({ partId: 'A1', userId: aliceId, from: new Date('2024-01-01') })
  await assignPart({ partId: 'A1', userId: bobId, from: new Date('2025-01-01') })

  expect(await getCurrentOwner('A1')).toBe(bobId)

  const history = await listAssignmentHistory('A1')
  expect(history).toHaveLength(2)
  // Newest first
  expect(history[0]).toMatchObject({ userId: bobId, assignedTo: null })
  // Prior assignment closed at the new from date (half-open)
  expect(history[1].userId).toBe(aliceId)
  expect(history[1].assignedTo?.toISOString().slice(0, 10)).toBe('2025-01-01')
})

test('getOwnerAt treats assignedFrom as inclusive and assignedTo as exclusive', async () => {
  await takeExclusivePart('B1')
  const aliceId = scope.user('alice')
  const bobId = scope.user('bob')
  await db.insert(user).values([
    { id: aliceId, name: 'Alice', email: scope.email('alice') },
    { id: bobId, name: 'Bob', email: scope.email('bob') },
  ])

  await assignPart({ partId: 'B1', userId: aliceId, from: new Date('2024-01-01') })
  await assignPart({ partId: 'B1', userId: bobId, from: new Date('2025-01-01') })

  // Before either assignment: nobody.
  expect(await getOwnerAt('B1', new Date('2023-12-31'))).toBeNull()
  // Inside Alice's window.
  expect(await getOwnerAt('B1', new Date('2024-06-15'))).toBe(aliceId)
  // Day before handover: still Alice.
  expect(await getOwnerAt('B1', new Date('2024-12-31'))).toBe(aliceId)
  // Handover day itself: Bob (new owner from this date).
  expect(await getOwnerAt('B1', new Date('2025-01-01'))).toBe(bobId)
  // Far future: still Bob (assignment open).
  expect(await getOwnerAt('B1', new Date('2099-01-01'))).toBe(bobId)
})

test('unassignPart closes the open assignment and is a no-op when none is open', async () => {
  await takeExclusivePart('C1')
  const aliceId = scope.user('alice')
  await db.insert(user).values({ id: aliceId, name: 'Alice', email: scope.email('alice') })
  await assignPart({ partId: 'C1', userId: aliceId, from: new Date('2024-01-01') })

  await unassignPart('C1', new Date('2024-06-30'))

  expect(await getCurrentOwner('C1')).toBeNull()
  const history = await listAssignmentHistory('C1')
  expect(history[0].assignedTo?.toISOString().slice(0, 10)).toBe('2024-06-30')

  // Second unassign is a no-op (already closed).
  await unassignPart('C1', new Date('2024-12-31'))
  const after = await listAssignmentHistory('C1')
  expect(after[0].assignedTo?.toISOString().slice(0, 10)).toBe('2024-06-30')
})

test('listPartsWithCurrentOwner returns 20 rows with currentUserId left-joined', async () => {
  await takeExclusivePart('D1')
  await takeExclusivePart('D2')
  const aliceId = scope.user('alice')
  await db.insert(user).values({ id: aliceId, name: 'Alice', email: scope.email('alice') })
  await assignPart({ partId: 'D1', userId: aliceId, from: new Date('2024-01-01') })

  const rows = await listPartsWithCurrentOwner()
  expect(rows).toHaveLength(20)
  const d1 = rows.find((r) => r.id === 'D1')
  const d2 = rows.find((r) => r.id === 'D2')
  expect(d1?.currentUserId).toBe(aliceId)
  expect(d2?.currentUserId).toBeNull()
})

test('listAssignmentsForUser returns every assignment for that user, newest first', async () => {
  // Scoped user has no pre-existing assignments by construction (unique ID).
  await takeExclusivePart('E1')
  await takeExclusivePart('F1')
  const aliceId = scope.user('alice')
  await db.insert(user).values({ id: aliceId, name: 'Alice', email: scope.email('alice') })
  await assignPart({ partId: 'E1', userId: aliceId, from: new Date('2023-01-01') })
  await assignPart({ partId: 'E1', userId: aliceId, from: new Date('2024-01-01') })
  await assignPart({ partId: 'F1', userId: aliceId, from: new Date('2025-01-01') })

  const rows = await listAssignmentsForUser(aliceId)
  expect(rows.map((r) => r.assignedFrom.toISOString().slice(0, 10))).toEqual([
    '2025-01-01',
    '2024-01-01',
    '2023-01-01',
  ])
})

test('partial unique index forbids two simultaneously-open assignments for one part', async () => {
  await takeExclusivePart('G1')
  const aliceId = scope.user('alice')
  const bobId = scope.user('bob')
  await db.insert(user).values([
    { id: aliceId, name: 'Alice', email: scope.email('alice') },
    { id: bobId, name: 'Bob', email: scope.email('bob') },
  ])

  await db.insert(ownershipAssignment).values({
    id: randomUUID(),
    partId: 'G1',
    userId: aliceId,
    assignedFrom: new Date('2024-01-01'),
    assignedTo: null,
  })

  await expect(
    db.insert(ownershipAssignment).values({
      id: randomUUID(),
      partId: 'G1',
      userId: bobId,
      assignedFrom: new Date('2024-06-01'),
      assignedTo: null,
    }),
  ).rejects.toThrow()
})
