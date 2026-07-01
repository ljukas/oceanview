import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { pickLanIp } from './lanIp.mjs'

// Launcher behind `pnpm dev` / `pnpm dev --host`.
//   `pnpm dev`         → Vite on localhost, nothing injected.
//   `pnpm dev --host`  → also auto-detect the machine's LAN IP and inject it as
//                        the DEV_HOST env var, so a phone on the same Wi-Fi can
//                        reach auth + storage at that IP with NO hand-edited
//                        addresses (see src/lib/devHost.ts). DEV_HOST is in no
//                        `.env` file, so the dev server's env loader can't
//                        clobber it.
// Plain node .mjs (like the other scripts/) so it needs no tsx/build step.

const args = process.argv.slice(2)

if (args.includes('--host')) {
  const ip = pickLanIp(networkInterfaces())
  if (ip) {
    process.env.DEV_HOST = ip
    console.log(
      `\n  ▸ LAN host mode — open these on your phone (same Wi-Fi):\n` +
        `      app:     http://${ip}:14500\n` +
        `      Mailpit: http://${ip}:14502   (tap the sign-in link here)\n`,
    )
  } else {
    console.warn(
      '\n  ⚠  --host given but no LAN IPv4 found (offline?). ' +
        'Serving without DEV_HOST — localhost only.\n',
    )
  }
}

// Run Vite's CLI as a child with the (possibly augmented) env. Passing the
// original args through means `--host` still reaches Vite so it binds 0.0.0.0.
// Resolve vite/package.json (its "exports" doesn't expose ./bin/vite.js) and
// join to the bin path on disk.
const vitePkg = createRequire(import.meta.url).resolve('vite/package.json')
const viteBin = join(dirname(vitePkg), 'bin/vite.js')
const child = spawn(process.execPath, [viteBin, 'dev', ...args], {
  stdio: 'inherit',
  env: process.env,
})
child.on('exit', (code) => process.exit(code ?? 0))
