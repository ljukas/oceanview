import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vitest/config'

const isTest = process.env.VITEST === 'true'

// Local `pnpm test` is force-pointed at the Neon Local `db` service via the
// session-pool URL (`neondb_session`) — see the `SET search_path` comment in
// `src/lib/db/index.ts` for why session pooling is required. Tests create
// per-test schemas (`test_w*`); the dev app's `public` schema is untouched.
// In CI (`CI=true`) we inherit DATABASE_URL from the job env instead.
const TEST_DATABASE_URL = 'postgres://neon:npg@localhost:5432/neondb_session?sslmode=require'

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
    // TEST_SCHEMA flips src/lib/db/index.ts into test mode (pinned single
    // connection + exposed __testClient). Setting it here means the runner
    // injects it into the worker before any module evaluates, so setup.ts
    // can use a normal static import.
    env: {
      TEST_SCHEMA: '1',
      ...(process.env.CI ? {} : { DATABASE_URL: TEST_DATABASE_URL }),
    },
  },
})
