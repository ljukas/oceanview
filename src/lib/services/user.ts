import { and, asc, count, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { user } from '~/lib/db/schema'

export type UserRow = {
  id: string
  name: string
  email: string
  phone: string | null
  role: string | null
  createdAt: Date
  deletedAt: Date | null
}

const userSelection = {
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  createdAt: user.createdAt,
  deletedAt: user.deletedAt,
}

export async function findIdByEmail(email: string): Promise<string | null> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
  return row?.id ?? null
}

export async function setAdmin(id: string): Promise<void> {
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, id))
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

export async function findById(id: string): Promise<UserRow | null> {
  const [row] = await db.select(userSelection).from(user).where(eq(user.id, id)).limit(1)
  return row ?? null
}

export type CreateUserInput = {
  id: string
  name: string
  email: string
  phone: string
  role: 'user' | 'admin'
}

export async function createUser(input: CreateUserInput): Promise<UserRow> {
  const [row] = await db
    .insert(user)
    .values({
      id: input.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: input.role,
      emailVerified: false,
    })
    .returning(userSelection)
  return row
}

export type UpdateUserInput = Partial<{
  name: string
  email: string
  phone: string
  role: 'user' | 'admin'
}>

export async function updateUser(id: string, patch: UpdateUserInput): Promise<UserRow> {
  const [row] = await db.update(user).set(patch).where(eq(user.id, id)).returning(userSelection)
  return row
}

export async function softDeleteUser(id: string): Promise<void> {
  await db.update(user).set({ deletedAt: new Date() }).where(eq(user.id, id))
}

export async function countAdmins(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(user)
    .where(and(eq(user.role, 'admin'), isNull(user.deletedAt)))
  return Number(row?.value ?? 0)
}
