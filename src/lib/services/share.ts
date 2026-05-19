import { and, asc, desc, eq, gt, isNull, lte, or } from 'drizzle-orm'
import { db } from '~/lib/db'
import { ownershipAssignment, sharePart } from '~/lib/db/schema'
import type { ShareCode } from '~/lib/shares/codes'

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
  partId: string
  userId: string
  assignedFrom: Date
  assignedTo: Date | null
}

const partSelection = {
  id: sharePart.id,
  shareCode: sharePart.shareCode,
  partNumber: sharePart.partNumber,
}

const assignmentSelection = {
  id: ownershipAssignment.id,
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

export async function listAssignmentHistory(partId: string): Promise<Array<AssignmentRow>> {
  return db
    .select(assignmentSelection)
    .from(ownershipAssignment)
    .where(eq(ownershipAssignment.partId, partId))
    .orderBy(desc(ownershipAssignment.assignedFrom))
}

export type AssignPartInput = {
  partId: string
  userId: string
  from: Date
}

export async function assignPart(input: AssignPartInput): Promise<AssignmentRow> {
  return db.transaction(async (tx) => {
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
        partId: input.partId,
        userId: input.userId,
        assignedFrom: input.from,
        assignedTo: null,
      })
      .returning(assignmentSelection)
    return row
  })
}

export async function unassignPart(partId: string, on: Date): Promise<void> {
  await db
    .update(ownershipAssignment)
    .set({ assignedTo: on })
    .where(and(eq(ownershipAssignment.partId, partId), isNull(ownershipAssignment.assignedTo)))
}
