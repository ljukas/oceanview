import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  notExists,
  or,
  sql,
} from 'drizzle-orm'
import { db } from '~/lib/db'
import { ownershipAssignment, ownershipAssignmentEvent, sharePart } from '~/lib/db/schema'
import * as userService from '~/lib/services/user'
import { type ShareCode, sharePartId } from '~/lib/shares/codes'
import { ShareDomainError } from './errors'

export type SharePartRow = {
  id: string
  shareCode: ShareCode
  partNumber: number
}

export type PartWithCurrentOwnerRow = SharePartRow & {
  currentUserId: string | null
}

export type AssignmentRow = {
  id: string
  eventId: string
  partId: string
  userId: string
  assignedFrom: Date
  assignedTo: Date | null
}

export type ShareEventRow = {
  eventId: string
  createdAt: Date
  actorUserId: string | null
  children: Array<AssignmentRow>
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type DbOrTx = typeof db | DbTransaction

const partSelection = {
  id: sharePart.id,
  shareCode: sharePart.shareCode,
  partNumber: sharePart.partNumber,
}

const assignmentSelection = {
  id: ownershipAssignment.id,
  eventId: ownershipAssignment.eventId,
  partId: ownershipAssignment.partId,
  userId: ownershipAssignment.userId,
  assignedFrom: ownershipAssignment.assignedFrom,
  assignedTo: ownershipAssignment.assignedTo,
}

export async function listParts(): Promise<Array<SharePartRow>> {
  return db
    .select(partSelection)
    .from(sharePart)
    .orderBy(asc(sharePart.shareCode), asc(sharePart.partNumber))
}

export async function findPartById(id: string): Promise<SharePartRow | null> {
  const [row] = await db.select(partSelection).from(sharePart).where(eq(sharePart.id, id)).limit(1)
  return row ?? null
}

export async function listPartsWithCurrentOwner(): Promise<Array<PartWithCurrentOwnerRow>> {
  return db
    .select({
      ...partSelection,
      currentUserId: ownershipAssignment.userId,
    })
    .from(sharePart)
    .leftJoin(
      ownershipAssignment,
      and(eq(ownershipAssignment.partId, sharePart.id), isNull(ownershipAssignment.assignedTo)),
    )
    .orderBy(asc(sharePart.shareCode), asc(sharePart.partNumber))
}

export async function getCurrentOwner(partId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: ownershipAssignment.userId })
    .from(ownershipAssignment)
    .where(and(eq(ownershipAssignment.partId, partId), isNull(ownershipAssignment.assignedTo)))
    .limit(1)
  return row?.userId ?? null
}

async function getActiveAssignment(
  partId: string,
  dbOrTx: DbOrTx = db,
): Promise<AssignmentRow | null> {
  const [row] = await dbOrTx
    .select(assignmentSelection)
    .from(ownershipAssignment)
    .where(and(eq(ownershipAssignment.partId, partId), isNull(ownershipAssignment.assignedTo)))
    .limit(1)
  return row ?? null
}

// Half-open lookup: [assignedFrom, assignedTo). The owner on the exact
// `assignedFrom` date is the new owner; the owner on the exact `assignedTo`
// date is whoever came next (or nobody).
export async function getOwnerAt(partId: string, date: Date): Promise<string | null> {
  const [row] = await db
    .select({ userId: ownershipAssignment.userId })
    .from(ownershipAssignment)
    .where(
      and(
        eq(ownershipAssignment.partId, partId),
        lte(ownershipAssignment.assignedFrom, date),
        or(isNull(ownershipAssignment.assignedTo), gt(ownershipAssignment.assignedTo, date)),
      ),
    )
    .limit(1)
  return row?.userId ?? null
}

export async function listAssignmentsForUser(userId: string): Promise<Array<AssignmentRow>> {
  return db
    .select(assignmentSelection)
    .from(ownershipAssignment)
    .where(eq(ownershipAssignment.userId, userId))
    .orderBy(desc(ownershipAssignment.assignedFrom))
}

export async function listCurrentPartsForUser(userId: string): Promise<Array<SharePartRow>> {
  return db
    .select(partSelection)
    .from(sharePart)
    .innerJoin(
      ownershipAssignment,
      and(eq(ownershipAssignment.partId, sharePart.id), isNull(ownershipAssignment.assignedTo)),
    )
    .where(eq(ownershipAssignment.userId, userId))
    .orderBy(asc(sharePart.shareCode), asc(sharePart.partNumber))
}

// Per-part history (newest first). Used by the season service and unit tests
// for flat-row inspection; the admin history sheet uses `listShareEvents`.
export async function listAssignmentHistory(partId: string): Promise<Array<AssignmentRow>> {
  return db
    .select(assignmentSelection)
    .from(ownershipAssignment)
    .where(eq(ownershipAssignment.partId, partId))
    .orderBy(desc(ownershipAssignment.assignedFrom))
}

// History grouped by event: whole-share assignments collapse to one event with
// two children; splits to one event with two differently-userid children; a
// mid-stream half reassignment is its own event with one child. Children
// include both active (assignedTo IS NULL) and closed rows for the event.
export async function listShareEvents(shareCode: ShareCode): Promise<Array<ShareEventRow>> {
  const part1Id = sharePartId(shareCode, 1)
  const part2Id = sharePartId(shareCode, 2)

  const rows = await db
    .select({
      eventId: ownershipAssignmentEvent.id,
      createdAt: ownershipAssignmentEvent.createdAt,
      actorUserId: ownershipAssignmentEvent.actorUserId,
      assignment: assignmentSelection,
    })
    .from(ownershipAssignmentEvent)
    .innerJoin(ownershipAssignment, eq(ownershipAssignment.eventId, ownershipAssignmentEvent.id))
    .where(inArray(ownershipAssignment.partId, [part1Id, part2Id]))
    .orderBy(desc(ownershipAssignmentEvent.createdAt), asc(ownershipAssignment.partId))

  const byEvent = new Map<string, ShareEventRow>()
  for (const r of rows) {
    let entry = byEvent.get(r.eventId)
    if (!entry) {
      entry = {
        eventId: r.eventId,
        createdAt: r.createdAt,
        actorUserId: r.actorUserId,
        children: [],
      }
      byEvent.set(r.eventId, entry)
    }
    entry.children.push(r.assignment)
  }
  return Array.from(byEvent.values())
}

export type AssignPartInput = {
  partId: string
  userId: string
  from: Date
}

async function createEventTx(
  tx: DbTransaction,
  input: { actorUserId: string | null },
): Promise<string> {
  const [row] = await tx
    .insert(ownershipAssignmentEvent)
    .values({ actorUserId: input.actorUserId })
    .returning({ id: ownershipAssignmentEvent.id })
  return row.id
}

async function assignPartTx(
  tx: DbTransaction,
  input: AssignPartInput & { eventId: string },
): Promise<AssignmentRow> {
  await tx
    .update(ownershipAssignment)
    .set({ assignedTo: input.from })
    .where(
      and(eq(ownershipAssignment.partId, input.partId), isNull(ownershipAssignment.assignedTo)),
    )

  const [row] = await tx
    .insert(ownershipAssignment)
    .values({
      id: crypto.randomUUID(),
      eventId: input.eventId,
      partId: input.partId,
      userId: input.userId,
      assignedFrom: input.from,
      assignedTo: null,
    })
    .returning(assignmentSelection)
  return row
}

async function unassignPartTx(tx: DbTransaction, partId: string, on: Date): Promise<void> {
  await tx
    .update(ownershipAssignment)
    .set({ assignedTo: on })
    .where(and(eq(ownershipAssignment.partId, partId), isNull(ownershipAssignment.assignedTo)))
}

// Single-part assignment, creates its own event. Low-level helper used by the
// season service and tests; the admin share form uses `assignShareAsAdmin`
// (atomic across both halves, runs the org invariant).
export async function assignPart(
  input: AssignPartInput,
  ctx: { actorUserId?: string | null } = {},
): Promise<AssignmentRow> {
  return db.transaction(async (tx) => {
    const eventId = await createEventTx(tx, { actorUserId: ctx.actorUserId ?? null })
    return assignPartTx(tx, { ...input, eventId })
  })
}

export async function unassignPart(partId: string, on: Date): Promise<void> {
  await db.transaction((tx) => unassignPartTx(tx, partId, on))
}

// Org invariant: every user who still has any active assignment must own at
// least one whole share (both halves of some share). Users left with zero
// active assignments are valid. Run pre-commit inside the mutation tx.
//
// Single round-trip: among candidate users with any active assignment, find
// those who do NOT own a complete (X1, X2) pair. Throws on the first one.
async function assertEveryAffectedUserHasWhole(
  tx: DbTransaction,
  userIds: ReadonlyArray<string>,
): Promise<void> {
  if (userIds.length === 0) return

  const a1 = aliasedTable(ownershipAssignment, 'a1')
  const sp1 = aliasedTable(sharePart, 'sp1')
  const a2 = aliasedTable(ownershipAssignment, 'a2')
  const sp2 = aliasedTable(sharePart, 'sp2')

  // Subquery: this user owns at least one (X1, X2) pair right now.
  const ownsAWhole = tx
    .select({ one: sql`1`.as('one') })
    .from(a1)
    .innerJoin(sp1, eq(sp1.id, a1.partId))
    .innerJoin(a2, and(eq(a2.userId, a1.userId), isNull(a2.assignedTo)))
    .innerJoin(
      sp2,
      and(
        eq(sp2.id, a2.partId),
        eq(sp2.shareCode, sp1.shareCode),
        ne(sp2.partNumber, sp1.partNumber),
      ),
    )
    .where(and(eq(a1.userId, ownershipAssignment.userId), isNull(a1.assignedTo)))

  const offending = await tx
    .select({ userId: ownershipAssignment.userId })
    .from(ownershipAssignment)
    .where(
      and(
        inArray(ownershipAssignment.userId, [...userIds]),
        isNull(ownershipAssignment.assignedTo),
        notExists(ownsAWhole),
      ),
    )
    .limit(1)

  if (offending.length > 0) {
    throw new ShareDomainError('LEAVES_USER_WITH_ONLY_HALVES')
  }
}

export type AssignShareInput = {
  shareCode: ShareCode
  from: Date
  assignment:
    | { kind: 'whole'; userId: string }
    | { kind: 'split'; part1UserId: string; part2UserId: string }
}

export type UnassignShareInput = {
  shareCode: ShareCode
  on: Date
  parts: 'both' | '1' | '2'
}

// Admin entry-points: invariant-checked, atomic across both halves.
// The form treats the pair as the default unit; service surfaces typed
// ShareDomainError so the procedure layer can map to Swedish ORPCError.
export async function assignShareAsAdmin(
  input: AssignShareInput,
  ctx: { actorUserId?: string | null } = {},
): Promise<void> {
  const part1Id = sharePartId(input.shareCode, 1)
  const part2Id = sharePartId(input.shareCode, 2)

  const targets: Array<{ partId: string; userId: string }> =
    input.assignment.kind === 'whole'
      ? [
          { partId: part1Id, userId: input.assignment.userId },
          { partId: part2Id, userId: input.assignment.userId },
        ]
      : [
          { partId: part1Id, userId: input.assignment.part1UserId },
          { partId: part2Id, userId: input.assignment.part2UserId },
        ]

  await db.transaction(async (tx) => {
    // Active-user check; a deleted user can never be assigned. Must run on
    // `tx`: with the test pool pinned to one connection, an outer-`db` query
    // inside this transaction would wait on the connection the tx holds.
    const uniqueUserIds = [...new Set(targets.map((t) => t.userId))]
    for (const userId of uniqueUserIds) {
      const u = await userService.findActiveById(userId, tx)
      if (!u) throw new ShareDomainError('USER_NOT_FOUND')
    }

    // Per-part validation. Skip parts whose target equals the current owner —
    // makes "Tilldela hel andel A → Alice" lenient when Alice already has A1
    // but not A2: only the half that actually changes runs. Reads share the
    // mutation tx; concurrent-admin races are accepted at this scale (ADR-0002).
    const fromMs = input.from.getTime()
    const changes: Array<{ partId: string; userId: string }> = []
    const displacedUserIds = new Set<string>()
    for (const t of targets) {
      const existing = await getActiveAssignment(t.partId, tx)
      if (existing && existing.userId === t.userId) continue
      if (existing && fromMs <= existing.assignedFrom.getTime()) {
        throw new ShareDomainError('FROM_DATE_NOT_AFTER_CURRENT')
      }
      if (existing) displacedUserIds.add(existing.userId)
      changes.push(t)
    }

    if (changes.length === 0) throw new ShareDomainError('ALREADY_CURRENT_OWNER')

    const eventId = await createEventTx(tx, { actorUserId: ctx.actorUserId ?? null })
    for (const c of changes) {
      await assignPartTx(tx, { partId: c.partId, userId: c.userId, from: input.from, eventId })
    }
    // Affected users = new owners (might end up with only halves) + anyone
    // displaced (might be left with only halves elsewhere).
    const affected = new Set<string>([...changes.map((c) => c.userId), ...displacedUserIds])
    await assertEveryAffectedUserHasWhole(tx, [...affected])
  })
}

export async function unassignShareAsAdmin(input: UnassignShareInput): Promise<void> {
  const part1Id = sharePartId(input.shareCode, 1)
  const part2Id = sharePartId(input.shareCode, 2)
  const targets =
    input.parts === 'both' ? [part1Id, part2Id] : input.parts === '1' ? [part1Id] : [part2Id]

  await db.transaction(async (tx) => {
    const onMs = input.on.getTime()
    let anyAssigned = false
    const toClose: string[] = []
    const displacedUserIds = new Set<string>()
    for (const partId of targets) {
      const existing = await getActiveAssignment(partId, tx)
      if (!existing) continue
      anyAssigned = true
      if (onMs <= existing.assignedFrom.getTime()) {
        throw new ShareDomainError('DATE_NOT_AFTER_CURRENT')
      }
      toClose.push(partId)
      displacedUserIds.add(existing.userId)
    }

    if (!anyAssigned) throw new ShareDomainError('NOT_ASSIGNED')

    for (const partId of toClose) {
      await unassignPartTx(tx, partId, input.on)
    }
    await assertEveryAffectedUserHasWhole(tx, [...displacedUserIds])
  })
}
