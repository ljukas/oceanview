import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { devtools } from '@tanstack/devtools-vite'
import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const isTest = process.env.VITEST === 'true'

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
    fileParallelism: false,
    hookTimeout: 20_000,
  },
})
