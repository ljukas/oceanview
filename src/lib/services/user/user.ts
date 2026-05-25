import { and, asc, count, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { user } from '~/lib/db/schema'
import { UserDomainError } from './errors'

export type UserRow = {
  id: string
  name: string
  email: string
  phone: string | null
  role: string | null
  image: string | null
  imageBlurhash: string | null
  createdAt: Date
  deletedAt: Date | null
}

export type CreateUserInput = {
  name: string
  email: string
  phone: string
  role: 'user' | 'admin'
}

export type UpdateUserInput = {
  name: string
  email: string
  phone: string
  role: 'user' | 'admin'
}

const userSelection = {
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  image: user.image,
  imageBlurhash: user.imageBlurhash,
  createdAt: user.createdAt,
  deletedAt: user.deletedAt,
}

export async function findIdByEmail(email: string): Promise<string | null> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
  return row?.id ?? null
}

export async function listAll(): Promise<Array<UserRow>> {
  return db.select(userSelection).from(user).where(isNull(user.deletedAt)).orderBy(asc(user.name))
}

export async function listDeleted(): Promise<Array<UserRow>> {
  return db
    .select(userSelection)
    .from(user)
    .where(isNotNull(user.deletedAt))
    .orderBy(desc(user.deletedAt))
}

export async function findRowById(id: string): Promise<UserRow | null> {
  const [row] = await db.select(userSelection).from(user).where(eq(user.id, id)).limit(1)
  return row ?? null
}

export async function findActiveById(id: string): Promise<UserRow | null> {
  const row = await findRowById(id)
  if (!row || row.deletedAt) return null
  return row
}

export async function countAdmins(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(user)
    .where(and(eq(user.role, 'admin'), isNull(user.deletedAt)))
  return Number(row?.value ?? 0)
}

export async function createAsAdmin(input: CreateUserInput): Promise<UserRow> {
  const [row] = await db
    .insert(user)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: input.role,
      emailVerified: false,
    })
    .returning(userSelection)
  return row
}

export async function updateAsAdmin(
  actorId: string,
  targetId: string,
  input: UpdateUserInput,
): Promise<UserRow> {
  const target = await findRowById(targetId)
  if (!target) throw new UserDomainError('NOT_FOUND')
  if (target.deletedAt) throw new UserDomainError('TARGET_DELETED')

  const demotingSelf = actorId === targetId && input.role !== 'admin'
  if (demotingSelf) throw new UserDomainError('CANNOT_ACT_ON_SELF')

  const demotingAdmin = target.role === 'admin' && input.role !== 'admin'
  if (demotingAdmin && (await countAdmins()) <= 1) {
    throw new UserDomainError('LAST_ADMIN')
  }

  const [row] = await db
    .update(user)
    .set({
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: input.role,
    })
    .where(eq(user.id, targetId))
    .returning(userSelection)
  return row
}

export async function softDeleteAsAdmin(actorId: string, targetId: string): Promise<void> {
  if (actorId === targetId) throw new UserDomainError('CANNOT_ACT_ON_SELF')

  const target = await findRowById(targetId)
  if (!target) throw new UserDomainError('NOT_FOUND')
  if (target.deletedAt) return

  if (target.role === 'admin' && (await countAdmins()) <= 1) {
    throw new UserDomainError('LAST_ADMIN')
  }

  await db.update(user).set({ deletedAt: new Date() }).where(eq(user.id, targetId))
}

export async function restoreAsAdmin(targetId: string): Promise<void> {
  const target = await findRowById(targetId)
  if (!target) throw new UserDomainError('NOT_FOUND')
  if (!target.deletedAt) return

  await db.update(user).set({ deletedAt: null }).where(eq(user.id, targetId))
}
