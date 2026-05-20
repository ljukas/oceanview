import { drizzle } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// In tests: pin to one connection so the `SET search_path` issued in
// `test/setup.ts` persists across every drizzle query and transaction. Tests
// must connect to Neon Local's session-pool URL (`neondb_session`); under the
// default transaction-pool URL the backend session is recycled after every
// txn and the SET is lost.
const client = postgres(process.env.DATABASE_URL, {
  prepare: false,
  ...(process.env.TEST_SCHEMA ? { max: 1 } : {}),
})

export const db = drizzle({ client, schema, casing: 'snake_case' })

// Test-only handles. Undefined in production. `test/setup.ts` uses these to
// create per-test schemas on the same single connection the app's `db` uses.
export const __testClient: Sql | undefined = process.env.TEST_SCHEMA ? client : undefined

export async function __closeTestPool(): Promise<void> {
  if (!process.env.TEST_SCHEMA) return
  await client.end({ timeout: 5 })
}
