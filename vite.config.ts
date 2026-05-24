import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vitest/config'
import { IMAGE_SIZES } from './src/lib/image/sizes'

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
        // `@better-auth/passkey` → `@simplewebauthn/server` → `@peculiar/x509`
        // uses tsyringe decorators that call `Reflect.getMetadata` at module-
        // load time. The polyfill lives at the top of x509's ESM build as a
        // bare `import 'reflect-metadata'`, which Nitro's Rolldown pipeline
        // tree-shakes out by default — so SSR crashes with
        // `TypeError: Reflect.getMetadata is not a function` on the first page
        // request in prod. Tell Rolldown to keep bare side-effect imports of
        // reflect-metadata (and re-state Nitro's own polyfill defaults so we
        // don't accidentally drop those either).
        // See https://github.com/better-auth/better-auth/issues/7463.
        nitro({
          // TanStack Start manages Nitro's serverDir; declare the queue
          // consumer plugin explicitly so it survives the rolldown bundle.
          // The file uses the `vercel:queue` runtime hook — see
          // `server/plugins/blurhashQueue.ts`.
          plugins: ['./server/plugins/blurhashQueue.ts'],
          // Activates Vercel Image Optimization for `/_vercel/image?url=…&w=…&q=…`.
          // The `unpic/providers/vercel` transformer (used by ~/lib/image/transformer)
          // produces URLs that resolve here in production. In `pnpm dev` the
          // transformer falls back to the raw source URL — see that module.
          vercel: {
            config: {
              version: 3,
              // `sizes` is the optimizer's allow-list — any `?w=` not in the
              // array is rejected with INVALID_IMAGE_OPTIMIZE_REQUEST. Source
              // of truth is `src/lib/image/sizes.ts` (shared with
              // `snapBreakpoints`, which components use to build srcsets).
              images: {
                sizes: [...IMAGE_SIZES],
                domains: [],
                remotePatterns: [
                  { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
                ],
                formats: ['image/webp'],
                minimumCacheTTL: 2_678_400,
              },
            },
            // Subscribes the Vercel preset's queue handler to the `blurhash`
            // topic. Producers call `queue.publish('blurhash', { fileId })`
            // from oRPC procedures; the consumer lives in
            // `server/plugins/blurhashQueue.ts` (vercel:queue hook).
            queues: {
              triggers: [{ topic: 'blurhash' }],
            },
          },
          rollupConfig: {
            treeshake: {
              moduleSideEffects: (id: string) => {
                if (id.includes('reflect-metadata')) return true
                if (id.includes('unenv/polyfill/')) return true
                if (id.includes('node-fetch-native/polyfill')) return true
                return false
              },
            },
          },
        }),
      ],
  test: {
    environment: 'node',
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
