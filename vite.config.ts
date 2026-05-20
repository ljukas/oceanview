import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vitest/config'

const isTest = process.env.VITEST === 'true'

// Local `pnpm test` is force-pointed at the `db-test` Neon Local proxy on
// :5433 so it can't clobber the dev DB on :5432 — even if `.env` or the
// user's shell exports DATABASE_URL=:5432. In CI (`CI=true`, set by GitHub
// Actions et al.) we instead inherit DATABASE_URL from the job env, which
// the workflow points at its own ephemeral branch on :5432.
//
// `neondb_session` (not `neondb`) selects PgBouncer's session-pooling mode in
// Neon Local. We need this because test setup issues `SET search_path` to a
// per-test schema and the app's drizzle queries must see it on subsequent
// queries — under the default transaction pooling, the backend connection
// is recycled after every txn and the SET is lost.
const TEST_DATABASE_URL = 'postgres://neon:npg@localhost:5433/neondb_session?sslmode=require'

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  // App build pulls in the TanStack Start + React + Tailwind + Nitro plugin chain.
  // Vitest runs server-only modules under `environment: 'node'`, so loading those
  // plugins would (a) try to evaluate React's CJS entry as ESM and (b) keep a Vite
  // dev server alive past test completion. Skip them under VITEST.
  plugins: isTest
    ? []
    : [
        devtools(),
        tailwindcss(),
        tanstackStart({
          srcDirectory: 'src',
        }),
        viteReact(),
        nitro(),
      ],
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    pool: 'forks',
    // Each test creates its own Postgres schema (see test/setup.ts). Cap
    // workers so the CREATE/DROP SCHEMA churn against Neon Local stays
    // bounded; bump cautiously after observing CI stability.
    maxWorkers: 4,
    hookTimeout: 20_000,
    env: process.env.CI ? {} : { DATABASE_URL: TEST_DATABASE_URL },
  },
})
