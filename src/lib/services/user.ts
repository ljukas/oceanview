import { eq } from 'drizzle-orm'
import { db } from '~/lib/db'
import { user } from '~/lib/db/schema'

export async function findIdByEmail(email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)
  return row?.id ?? null
}

export async function setAdmin(id: string): Promise<void> {
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, id))
}
