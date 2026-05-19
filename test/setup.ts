import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { db } from '~/lib/db'
import { season } from '~/lib/db/schema'
import type { ShareCode } from '~/lib/shares/codes'

const url = process.env.DATABASE_URL ?? ''
const isLocal = url.includes('localhost') || url.includes('127.0.0.1')

if (!isLocal) {
  throw new Error(
    `Refusing to run tests against non-local DATABASE_URL. Got: ${url || '<unset>'}. ` +
      `Tests truncate tables — they must only run against Neon Local. ` +
      `Run \`pnpm db:up\` and ensure .env points at the local proxy.`,
  )
}

// Mirrors drizzle/0004_seed_initial_seasons.sql. Kept here so `truncateAll`
// can restore the production-like starting state after each test; if the
// migration's seed values change, update this list too.
export const INITIAL_SEASONS: ReadonlyArray<{
  year: number
  startWeek: number
  startShare: ShareCode
}> = [
  { year: 2026, startWeek: 21, startShare: 'D' },
  // 2027 + 2028 anchor on W20 (second-to-last ISO May week per Thursday rule)
  { year: 2027, startWeek: 20, startShare: 'A' },
  { year: 2028, startWeek: 20, startShare: 'H' },
  { year: 2029, startWeek: 21, startShare: 'E' },
]

// Wipes mutable per-test tables between tests. CASCADE so child rows go with
// their parents; RESTART IDENTITY because some columns rely on Postgres
// sequences. Add new feature tables here as we introduce them — there's no
// automatic schema-introspection here on purpose, so a forgotten table fails
// loudly. Note: `share_part` is intentionally NOT truncated — it's catalog
// data seeded by the migration (A1..J2) that tests treat as a fixture.
// `season` IS truncated but immediately re-seeded with INITIAL_SEASONS so
// every test starts in the production-like state where the current four
// years (2026..2029) are already configured.
export async function truncateAll(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE "user", "session", "account", "verification", "passkey", "ownership_assignment", "season" RESTART IDENTITY CASCADE`,
  )
  await db.insert(season).values(INITIAL_SEASONS as Array<(typeof INITIAL_SEASONS)[number]>)
}
