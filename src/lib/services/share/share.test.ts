import { expect, test } from 'vitest'
import { db } from '~/lib/db'
import { ownershipAssignment, ownershipAssignmentEvent, user } from '~/lib/db/schema'
import { setupDatabase } from '~test/setup'
import type { ShareDomainError } from './errors'
import {
  assignPart,
  assignShareAsAdmin,
  findPartById,
  getCurrentOwner,
  getOwnerAt,
  listAssignmentHistory,
  listAssignmentsForUser,
  listParts,
  listPartsWithCurrentOwner,
  listShareEvents,
  unassignPart,
  unassignShareAsAdmin,
} from './share'

setupDatabase()

// Direct ownershipAssignment inserts need a parent event row.
async function seedEvent(): Promise<string> {
  const [row] = await db
    .insert(ownershipAssignmentEvent)
    .values({})
    .returning({ id: ownershipAssignmentEvent.id })
  return row.id
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
  expect(await getCurrentOwner('A1')).toBeNull()
})

test('assignPart creates an open assignment that becomes the current owner', async () => {
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({ name: 'Alice', email: 'alice@test.oceanview.local' })
    .returning({ id: user.id })

  const row = await assignPart({ partId: 'A1', userId: aliceId, from: new Date('2024-01-01') })

  expect(row.userId).toBe(aliceId)
  expect(row.assignedTo).toBeNull()
  expect(await getCurrentOwner('A1')).toBe(aliceId)
})

test('assignPart closes the prior open assignment on the new from date', async () => {
  const [{ id: aliceId }, { id: bobId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      { name: 'Bob', email: 'bob@test.oceanview.local' },
    ])
    .returning({ id: user.id })

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
  const [{ id: aliceId }, { id: bobId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      { name: 'Bob', email: 'bob@test.oceanview.local' },
    ])
    .returning({ id: user.id })

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
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({ name: 'Alice', email: 'alice@test.oceanview.local' })
    .returning({ id: user.id })
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
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({ name: 'Alice', email: 'alice@test.oceanview.local' })
    .returning({ id: user.id })
  await assignPart({ partId: 'D1', userId: aliceId, from: new Date('2024-01-01') })

  const rows = await listPartsWithCurrentOwner()
  expect(rows).toHaveLength(20)
  const d1 = rows.find((r) => r.id === 'D1')
  const d2 = rows.find((r) => r.id === 'D2')
  expect(d1?.currentUserId).toBe(aliceId)
  expect(d2?.currentUserId).toBeNull()
})

test('listAssignmentsForUser returns every assignment for that user, newest first', async () => {
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({ name: 'Alice', email: 'alice@test.oceanview.local' })
    .returning({ id: user.id })
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

test('assignShareAsAdmin whole-pair assigns both halves to one user atomically', async () => {
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({ name: 'Alice', email: 'alice@test.oceanview.local' })
    .returning({ id: user.id })

  await assignShareAsAdmin({
    shareCode: 'A',
    from: new Date('2024-01-01'),
    assignment: { kind: 'whole', userId: aliceId },
  })

  expect(await getCurrentOwner('A1')).toBe(aliceId)
  expect(await getCurrentOwner('A2')).toBe(aliceId)
})

test('assignShareAsAdmin split assigns each half to its own user', async () => {
  const [{ id: aliceId }, { id: bobId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      { name: 'Bob', email: 'bob@test.oceanview.local' },
    ])
    .returning({ id: user.id })

  // Org invariant: each split-recipient must already own a whole. Give Alice
  // whole A and Bob whole C as background, then split B between them.
  await assignShareAsAdmin({
    shareCode: 'A',
    from: new Date('2023-01-01'),
    assignment: { kind: 'whole', userId: aliceId },
  })
  await assignShareAsAdmin({
    shareCode: 'C',
    from: new Date('2023-01-01'),
    assignment: { kind: 'whole', userId: bobId },
  })

  await assignShareAsAdmin({
    shareCode: 'B',
    from: new Date('2024-01-01'),
    assignment: { kind: 'split', part1UserId: aliceId, part2UserId: bobId },
  })

  expect(await getCurrentOwner('B1')).toBe(aliceId)
  expect(await getCurrentOwner('B2')).toBe(bobId)
})

test('assignShareAsAdmin skips parts where the target already owns the half', async () => {
  const [{ id: aliceId }, { id: bobId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      { name: 'Bob', email: 'bob@test.oceanview.local' },
    ])
    .returning({ id: user.id })

  // Alice already owns C1.
  await assignPart({ partId: 'C1', userId: aliceId, from: new Date('2023-01-01') })

  // Whole-assign C to Bob: only C2 needs an insert; C1 closes Alice and opens Bob.
  await assignShareAsAdmin({
    shareCode: 'C',
    from: new Date('2024-01-01'),
    assignment: { kind: 'whole', userId: bobId },
  })

  expect(await getCurrentOwner('C1')).toBe(bobId)
  expect(await getCurrentOwner('C2')).toBe(bobId)

  // Re-running with the same target is a no-op and surfaces a typed error.
  await expect(
    assignShareAsAdmin({
      shareCode: 'C',
      from: new Date('2025-01-01'),
      assignment: { kind: 'whole', userId: bobId },
    }),
  ).rejects.toMatchObject({ code: 'ALREADY_CURRENT_OWNER' } satisfies Partial<ShareDomainError>)
})

test('assignShareAsAdmin rejects a from-date not after the current assignedFrom', async () => {
  const [{ id: aliceId }, { id: bobId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      { name: 'Bob', email: 'bob@test.oceanview.local' },
    ])
    .returning({ id: user.id })

  await assignPart({ partId: 'D1', userId: aliceId, from: new Date('2024-01-01') })

  await expect(
    assignShareAsAdmin({
      shareCode: 'D',
      from: new Date('2024-01-01'),
      assignment: { kind: 'whole', userId: bobId },
    }),
  ).rejects.toMatchObject({
    code: 'FROM_DATE_NOT_AFTER_CURRENT',
  } satisfies Partial<ShareDomainError>)
})

test('assignShareAsAdmin rejects an unknown user', async () => {
  await expect(
    assignShareAsAdmin({
      shareCode: 'E',
      from: new Date('2024-01-01'),
      assignment: { kind: 'whole', userId: '00000000-0000-0000-0000-000000000000' },
    }),
  ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' } satisfies Partial<ShareDomainError>)
})

test('unassignShareAsAdmin closes both halves when parts="both"', async () => {
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({ name: 'Alice', email: 'alice@test.oceanview.local' })
    .returning({ id: user.id })
  await assignShareAsAdmin({
    shareCode: 'F',
    from: new Date('2024-01-01'),
    assignment: { kind: 'whole', userId: aliceId },
  })

  await unassignShareAsAdmin({ shareCode: 'F', on: new Date('2024-06-30'), parts: 'both' })

  expect(await getCurrentOwner('F1')).toBeNull()
  expect(await getCurrentOwner('F2')).toBeNull()
})

test('unassignShareAsAdmin closes only the chosen half', async () => {
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({ name: 'Alice', email: 'alice@test.oceanview.local' })
    .returning({ id: user.id })
  // Background whole keeps the org invariant satisfied after one half of G
  // is unassigned (Alice would otherwise be left with just G1).
  await assignShareAsAdmin({
    shareCode: 'A',
    from: new Date('2023-01-01'),
    assignment: { kind: 'whole', userId: aliceId },
  })
  await assignShareAsAdmin({
    shareCode: 'G',
    from: new Date('2024-01-01'),
    assignment: { kind: 'whole', userId: aliceId },
  })

  await unassignShareAsAdmin({ shareCode: 'G', on: new Date('2024-06-30'), parts: '2' })

  expect(await getCurrentOwner('G1')).toBe(aliceId)
  expect(await getCurrentOwner('G2')).toBeNull()
})

test('unassignShareAsAdmin throws NOT_ASSIGNED when nothing is open for the selected parts', async () => {
  await expect(
    unassignShareAsAdmin({ shareCode: 'H', on: new Date('2024-06-30'), parts: 'both' }),
  ).rejects.toMatchObject({ code: 'NOT_ASSIGNED' } satisfies Partial<ShareDomainError>)
})

test('unassignShareAsAdmin rejects a date not after the current assignedFrom', async () => {
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({ name: 'Alice', email: 'alice@test.oceanview.local' })
    .returning({ id: user.id })
  await assignPart({ partId: 'I1', userId: aliceId, from: new Date('2024-01-01') })

  await expect(
    unassignShareAsAdmin({ shareCode: 'I', on: new Date('2024-01-01'), parts: '1' }),
  ).rejects.toMatchObject({ code: 'DATE_NOT_AFTER_CURRENT' } satisfies Partial<ShareDomainError>)
})

test('partial unique index forbids two simultaneously-open assignments for one part', async () => {
  const [{ id: aliceId }, { id: bobId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      { name: 'Bob', email: 'bob@test.oceanview.local' },
    ])
    .returning({ id: user.id })

  const eventId = await seedEvent()
  await db.insert(ownershipAssignment).values({
    eventId,
    partId: 'G1',
    userId: aliceId,
    assignedFrom: new Date('2024-01-01'),
    assignedTo: null,
  })

  await expect(
    db.insert(ownershipAssignment).values({
      eventId,
      partId: 'G1',
      userId: bobId,
      assignedFrom: new Date('2024-06-01'),
      assignedTo: null,
    }),
  ).rejects.toThrow()
})

test('whole assign creates one event with two same-user children sharing event_id', async () => {
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({ name: 'Alice', email: 'alice@test.oceanview.local' })
    .returning({ id: user.id })

  await assignShareAsAdmin({
    shareCode: 'A',
    from: new Date('2024-01-01'),
    assignment: { kind: 'whole', userId: aliceId },
  })

  const events = await listShareEvents('A')
  expect(events).toHaveLength(1)
  expect(events[0].children).toHaveLength(2)
  expect(events[0].children.every((c) => c.userId === aliceId)).toBe(true)
  expect(new Set(events[0].children.map((c) => c.eventId)).size).toBe(1)
  expect(events[0].children.map((c) => c.partId).sort()).toEqual(['A1', 'A2'])
})

test('split assign creates one event with two distinct-user children sharing event_id', async () => {
  const [{ id: aliceId }, { id: bobId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      { name: 'Bob', email: 'bob@test.oceanview.local' },
    ])
    .returning({ id: user.id })

  // Background wholes so the split is legal.
  await assignShareAsAdmin({
    shareCode: 'A',
    from: new Date('2023-01-01'),
    assignment: { kind: 'whole', userId: aliceId },
  })
  await assignShareAsAdmin({
    shareCode: 'C',
    from: new Date('2023-01-01'),
    assignment: { kind: 'whole', userId: bobId },
  })

  await assignShareAsAdmin({
    shareCode: 'B',
    from: new Date('2024-01-01'),
    assignment: { kind: 'split', part1UserId: aliceId, part2UserId: bobId },
  })

  const events = await listShareEvents('B')
  expect(events).toHaveLength(1)
  expect(events[0].children).toHaveLength(2)
  expect(new Set(events[0].children.map((c) => c.userId))).toEqual(new Set([aliceId, bobId]))
  expect(new Set(events[0].children.map((c) => c.eventId)).size).toBe(1)
})

test('reassigning one half mid-whole creates a new event with one child', async () => {
  const [{ id: aliceId }, { id: bobId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      { name: 'Bob', email: 'bob@test.oceanview.local' },
    ])
    .returning({ id: user.id })

  // Each starts with a whole so the org invariant survives the partial swap.
  await assignShareAsAdmin({
    shareCode: 'A',
    from: new Date('2023-01-01'),
    assignment: { kind: 'whole', userId: aliceId },
  })
  await assignShareAsAdmin({
    shareCode: 'C',
    from: new Date('2023-01-01'),
    assignment: { kind: 'whole', userId: bobId },
  })

  // Whole B to Alice, then later just B1 → Bob via a split form submission.
  // Bob keeps whole C, Alice keeps whole A — both still satisfy the invariant.
  await assignShareAsAdmin({
    shareCode: 'B',
    from: new Date('2024-01-01'),
    assignment: { kind: 'whole', userId: aliceId },
  })
  await assignShareAsAdmin({
    shareCode: 'B',
    from: new Date('2025-01-01'),
    assignment: { kind: 'split', part1UserId: bobId, part2UserId: aliceId },
  })

  const events = await listShareEvents('B')
  // Two events: the original whole, then the split. The split only changes
  // one half (B1) — B2 keeps its prior event row (assignedTo gets closed
  // for B2 only if B2 changes user; in this case B2 stays Alice, so the
  // service skips it).
  expect(events).toHaveLength(2)
  const [newer, older] = events
  expect(older.children).toHaveLength(2)
  expect(older.children.every((c) => c.userId === aliceId)).toBe(true)
  expect(newer.children).toHaveLength(1)
  expect(newer.children[0].partId).toBe('B1')
  expect(newer.children[0].userId).toBe(bobId)
})

test('listShareEvents returns events newest-first, including closed children', async () => {
  const [{ id: aliceId }, { id: bobId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      { name: 'Bob', email: 'bob@test.oceanview.local' },
    ])
    .returning({ id: user.id })

  await assignShareAsAdmin({
    shareCode: 'C',
    from: new Date('2023-01-01'),
    assignment: { kind: 'whole', userId: aliceId },
  })
  await assignShareAsAdmin({
    shareCode: 'D',
    from: new Date('2023-01-01'),
    assignment: { kind: 'whole', userId: bobId },
  })
  await assignShareAsAdmin({
    shareCode: 'C',
    from: new Date('2024-01-01'),
    assignment: { kind: 'whole', userId: bobId },
  })

  const events = await listShareEvents('C')
  expect(events).toHaveLength(2)
  // Newest first.
  expect(events[0].children.every((c) => c.userId === bobId)).toBe(true)
  expect(events[1].children.every((c) => c.userId === aliceId)).toBe(true)
  // Older event's children are now closed; newer's are active.
  expect(events[1].children.every((c) => c.assignedTo !== null)).toBe(true)
  expect(events[0].children.every((c) => c.assignedTo === null)).toBe(true)
})

test('assignShareAsAdmin rejects when the result would leave a user with only halves', async () => {
  const [{ id: aliceId }, { id: bobId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      { name: 'Bob', email: 'bob@test.oceanview.local' },
    ])
    .returning({ id: user.id })

  // Neither Alice nor Bob owns a whole; split would leave both as halves-only.
  await expect(
    assignShareAsAdmin({
      shareCode: 'B',
      from: new Date('2024-01-01'),
      assignment: { kind: 'split', part1UserId: aliceId, part2UserId: bobId },
    }),
  ).rejects.toMatchObject({
    code: 'LEAVES_USER_WITH_ONLY_HALVES',
  } satisfies Partial<ShareDomainError>)
})

test('assignShareAsAdmin allows split when both recipients already own a whole', async () => {
  const [{ id: aliceId }, { id: bobId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      { name: 'Bob', email: 'bob@test.oceanview.local' },
    ])
    .returning({ id: user.id })

  await assignShareAsAdmin({
    shareCode: 'A',
    from: new Date('2023-01-01'),
    assignment: { kind: 'whole', userId: aliceId },
  })
  await assignShareAsAdmin({
    shareCode: 'C',
    from: new Date('2023-01-01'),
    assignment: { kind: 'whole', userId: bobId },
  })

  // Now the split is legal — both still have their background wholes.
  await assignShareAsAdmin({
    shareCode: 'B',
    from: new Date('2024-01-01'),
    assignment: { kind: 'split', part1UserId: aliceId, part2UserId: bobId },
  })

  expect(await getCurrentOwner('B1')).toBe(aliceId)
  expect(await getCurrentOwner('B2')).toBe(bobId)
})

test('unassignShareAsAdmin rejects when it would strip a user of their only whole', async () => {
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({ name: 'Alice', email: 'alice@test.oceanview.local' })
    .returning({ id: user.id })

  // Alice owns whole A and a single half B1 (seeded via the low-level helper
  // which skips the org invariant). Unassigning A would leave her with B1.
  await assignShareAsAdmin({
    shareCode: 'A',
    from: new Date('2023-01-01'),
    assignment: { kind: 'whole', userId: aliceId },
  })
  await assignPart({ partId: 'B1', userId: aliceId, from: new Date('2023-06-01') })

  await expect(
    unassignShareAsAdmin({ shareCode: 'A', on: new Date('2024-01-01'), parts: 'both' }),
  ).rejects.toMatchObject({
    code: 'LEAVES_USER_WITH_ONLY_HALVES',
  } satisfies Partial<ShareDomainError>)
})

test('unassignShareAsAdmin allows unassigning when the user ends with zero assignments', async () => {
  const [{ id: aliceId }] = await db
    .insert(user)
    .values({ name: 'Alice', email: 'alice@test.oceanview.local' })
    .returning({ id: user.id })
  await assignShareAsAdmin({
    shareCode: 'A',
    from: new Date('2023-01-01'),
    assignment: { kind: 'whole', userId: aliceId },
  })

  // Alice's only share is A. Unassigning it leaves her with zero — allowed.
  await unassignShareAsAdmin({ shareCode: 'A', on: new Date('2024-01-01'), parts: 'both' })

  expect(await getCurrentOwner('A1')).toBeNull()
  expect(await getCurrentOwner('A2')).toBeNull()
})
