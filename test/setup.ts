import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { db } from '~/lib/db'

const url = process.env.DATABASE_URL ?? ''
const isLocal = url.includes('localhost') || url.includes('127.0.0.1')

if (!isLocal) {
  throw new Error(
    `Refusing to run tests against non-local DATABASE_URL. Got: ${url || '<unset>'}. ` +
      `Tests truncate tables — they must only run against Neon Local. ` +
      `Run \`pnpm db:up\` and ensure .env points at the local proxy.`,
  )
}

// Wipes every Better Auth-owned table between tests. CASCADE so child rows
// (session, account, verification all FK back to user) go with their parents;
// RESTART IDENTITY because some Better Auth columns rely on Postgres sequences.
// Add new feature tables here as we introduce them — there's no automatic
// schema-introspection here on purpose, so a forgotten table fails loudly.
export async function truncateAll(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE "user", "session", "account", "verification" RESTART IDENTITY CASCADE`,
  )
}
