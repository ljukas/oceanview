import 'dotenv/config'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'

const url = process.env.DATABASE_URL ?? ''
const isLocal = url.includes('localhost') || url.includes('127.0.0.1')
if (!isLocal) {
  throw new Error(
    `Refusing to run tests against non-local DATABASE_URL. Got: ${url || '<unset>'}. ` +
      `Tests CREATE/DROP schemas — they must only run against Neon Local. ` +
      `Run \`pnpm db:test:up\` (local) or rely on the CI workflow's :5432 setup.`,
  )
}

// Flag for src/lib/db/index.ts to pin its pool to a single connection. The
// actual schema name is created and SET per-test below, not at module load.
process.env.TEST_SCHEMA = '1'

// Import AFTER the env flag is set so db/index.ts sees it on first evaluation.
const { __testClient, __closeTestPool } = await import('~/lib/db')

if (!__testClient) {
  throw new Error(
    'db/index.ts did not expose __testClient — TEST_SCHEMA must be set before import.',
  )
}

const POOL_ID = process.env.VITEST_POOL_ID ?? String(process.pid)
const SCHEMA_PREFIX = `test_w${POOL_ID}_`

// Pre-built once per worker. Concatenate every migration's statements into a
// single SQL string with `"public".` stripped, so `search_path` resolves all
// references to the per-test schema. drizzle-kit emits no BEGIN/COMMIT in
// migrations, so a single `unsafe()` call runs cleanly in the implicit txn.
let MIGRATIONS_SQL = ''
let counter = 0
let currentSchema: string | null = null

beforeAll(async () => {
  // Drop any straggler schemas from a crashed prior run in this worker.
  const stragglers = await __testClient<{ nspname: string }[]>`
    SELECT nspname FROM pg_namespace WHERE nspname LIKE ${`${SCHEMA_PREFIX}%`}
  `
  for (const { nspname } of stragglers) {
    await __testClient.unsafe(`DROP SCHEMA IF EXISTS "${nspname}" CASCADE`)
  }

  const migrations = readMigrationFiles({ migrationsFolder: './drizzle' })
  MIGRATIONS_SQL = migrations
    .flatMap((m) => m.sql)
    .map((stmt) => stmt.replace(/"public"\./g, ''))
    .join(';\n')
})

beforeEach(async () => {
  counter += 1
  const schema = `${SCHEMA_PREFIX}${counter}`
  currentSchema = schema
  await __testClient.unsafe(
    `CREATE SCHEMA "${schema}";\nSET search_path TO "${schema}";\n${MIGRATIONS_SQL}`,
  )
})

afterEach(async () => {
  if (!currentSchema) return
  const schema = currentSchema
  currentSchema = null
  try {
    await __testClient.unsafe(`DROP SCHEMA "${schema}" CASCADE`)
  } catch {
    // Best-effort; beforeAll sweep on next run catches anything missed.
  }
})

afterAll(async () => {
  await __closeTestPool()
})
