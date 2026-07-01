# LAN dev host — zero-config phone testing via `pnpm dev --host`

**Status:** design • **Date:** 2026-06-30 • **Author:** brainstormed with Claude

## Context

Testing on a real phone (the only way to verify iOS-specific behaviour like the HEIC→JPEG `accept` change and EXIF GPS) requires the dev server, Better Auth, and the local storage to all agree on the **Mac's LAN IP** instead of `localhost` — because the phone can't reach `localhost`, and the app embeds absolute URLs in three places:

- **Better Auth** `baseURL` (magic-link URLs + the CSRF/origin check) — `src/lib/auth.ts`.
- **Storage** presigned PUT URLs *and* the public image URLs the browser displays — the browser uploads **directly** to storage (ADR-0006), so these must point at a host the phone can reach. Built server-side from `S3_ENDPOINT` (s3 adapter, selected at `src/lib/effects/storage/storage.ts:189`).
- **RustFS CORS** — the browser's cross-origin presigned PUT is rejected unless the storage container allows the app origin (`compose.yaml`).

Today this only works after hand-editing the LAN IP into `.env`, `.env.local`, and `compose.yaml` — brittle (DHCP changes the IP), it breaks plain `localhost` browsing (baseURL becomes the IP), and `.env.local` (a `vercel env pull` artifact) silently shadows `.env`.

**Goal:** `pnpm dev` stays pure-localhost; `pnpm dev --host` auto-detects the LAN IP and makes auth + storage work from a phone on the same Wi-Fi — **no hand-edited IPs, nothing committed that's machine-specific.**

**Non-goals:** remote/off-LAN access (tunnels), HTTPS/secure-context features (passkeys stay prod-only), Windows/Linux as the primary path (best-effort fallback only).

## Approach (chosen after researching alternatives)

`pnpm dev` stays stock (`vite dev`). A separate **`pnpm dev:host`** script detects the primary LAN IPv4 and injects it as a **brand-new env var, `DEV_HOST`**, then runs `vite dev --host`. No wrapper around the default `dev` path — a dedicated script keeps `pnpm dev` untouched and matches the repo's `dev:log`/`dev:worker`/`dev:up` convention. The app's existing env seams prefer `DEV_HOST` when present.

The injection is a shell one-liner so nothing has to spawn Vite:
```
"dev:host": "DEV_HOST=$(node scripts/printLanIp.mjs) vite dev --host"
```
`printLanIp.mjs` prints the detected IP to stdout; the shell sets it in Vite's environment. (Empty stdout when offline → `DEV_HOST=""` → localhost fallback.)

Why a *new* var rather than overwriting `BETTER_AUTH_URL`/`S3_ENDPOINT`: those keys exist in `.env`/`.env.local`, and whether the dev server's loader overrides a pre-set `process.env` value is undocumented (Nitro is beta). `DEV_HOST` appears in **no** `.env` file, so the loader has nothing to override it with — precedence becomes a non-issue. This is the load-bearing design decision.

Rejected alternatives: **tunnels** (ngrok/cloudflared) — for remote access, not same-Wi-Fi; rotating free-tier URLs and a second tunnel needed for the storage port. **Better Auth dynamic `baseURL`/`allowedHosts`** — Better Auth's own security guide discourages request-inference, and it wouldn't remove the storage/CORS work anyway. **Overwriting existing env vars** — fragile dependence on loader internals. **A wrapper on `dev` intercepting `--host`** — more moving parts on the hot path than a dedicated `dev:host`, and it forced the launcher to resolve + spawn the Vite bin.

## Components

Each unit has one job and a clear interface.

1. **`scripts/lanIp.mjs` — `pickLanIp(interfaces): string | null`** (pure JS, like the other `scripts/*.mjs`).
   Input: `os.networkInterfaces()` output. Returns the best LAN IPv4, or `null`. Prefers `en0`→`en1` (macOS Wi-Fi/Ethernet); otherwise the first non-internal IPv4 whose interface name isn't virtual (`bridge*`, `utun*`, `vmnet*`, `vnic*`, `llw*`, `awdl*`, …). Pure ⇒ unit-tested in isolation (`test/lanIp.test.ts`). (Needed because `networkInterfaces()` also returns `bridge100 → 192.168.64.x`, a VM/Docker bridge that must not be chosen.)

2. **`scripts/printLanIp.mjs` — the IP printer** (plain node). Calls `pickLanIp(networkInterfaces())`, writes the IP to **stdout** (empty if none) and any hints (Mailpit URL / offline warning) to **stderr** so they don't pollute the captured value. Invoked by the `dev:host` npm script: `DEV_HOST=$(node scripts/printLanIp.mjs) vite dev --host`. No Vite spawning — the shell owns process launch; `dev` and `dev:log` are untouched stock `vite dev`.

3. **`src/lib/devHost.ts` — app-side reader** (single source of truth for the dev-host URLs; reads `process.env` fresh each call so it's unit-tested).
   ```ts
   const APP_PORT = 14500, STORAGE_PORT = 14523
   const host = () => process.env.DEV_HOST || null
   export const devBaseUrl = () => { const h = host(); return h ? `http://${h}:${APP_PORT}` : null }
   export const devTrustedOrigins = () => { const h = host(); return h
     ? [`http://localhost:${APP_PORT}`, `http://127.0.0.1:${APP_PORT}`, `http://${h}:${APP_PORT}`] : [] }
   export const devS3Endpoint = () => { const h = host(); return h ? `http://${h}:${STORAGE_PORT}` : null }
   ```

4. **`src/lib/auth.ts` seam** — `resolveBaseURL()` returns `devBaseUrl() ?? <existing>`; `resolveTrustedOrigins()` appends `devTrustedOrigins()`. (Trusting localhost *and* the LAN IP means the app works from the Mac and the phone simultaneously.)

5. **`src/lib/effects/storage/adapters/s3.ts` seam** — the module-level `ENDPOINT` resolves as `devS3Endpoint() ?? envOrThrow('S3_ENDPOINT')`, which flows into both the presign client and `publicReadUrl`. The selector (`storage.ts:189`) already picks s3 because `.env` always sets `S3_ENDPOINT` in dev; only the endpoint *host* changes.

6. **`compose.yaml` — RustFS CORS → `*`** (local, ephemeral, dev-only storage; presigned PUTs carry no credentials). Removes the need to recreate the storage container per IP. (One-time caveat: an already-running container must be recreated once to pick up the new value — `COMPOSE_PROJECT_NAME=oceanview docker compose up -d --force-recreate storage`.)

7. **`src/lib/devHost.test.ts` + `test/lanIp.test.ts`** — unit tests for the getters and the interface picker.

Not part of the PR (local hygiene): the gitignored `.env`/`.env.local` stay on localhost values; `dev:host` supplies the LAN IP at runtime.

## Data flow

`pnpm dev:host` → `printLanIp.mjs` picks `192.168.x.y` → shell sets `DEV_HOST=192.168.x.y` for `vite dev --host` → Nitro loads `.env`/`.env.local` (localhost values) but leaves `DEV_HOST` untouched → `auth.ts` baseURL = `http://192.168.x.y:14500`, trusts localhost+LAN → s3 adapter endpoint = `http://192.168.x.y:14523` → phone hits the LAN URL, signs in via a LAN magic link (Mailpit), uploads straight to RustFS (CORS `*`), images display from the LAN storage URL. `pnpm dev` → `DEV_HOST` unset → every seam falls back to localhost.

## Error handling / edge cases

- **No LAN IP** (offline / Wi-Fi down): `printLanIp.mjs` writes nothing to stdout + warns on stderr → `DEV_HOST=""` → app behaves as localhost; Vite still binds via `--host`.
- **Ambiguous interfaces** (en0 + bridge100): `pickLanIp` ordering resolves it deterministically; unit-tested.
- **Non-macOS dev:** the `en0`/`en1` preference is a hint; the virtual-interface filter is the cross-platform fallback. Documented as best-effort.
- **`DEV_HOST` accidentally set in prod:** it's only ever injected by the `dev:host` script, never written to a committed env file; prod runs `vite build`/`start`, not `dev:host`. A comment in `devHost.ts` states it's dev-only.

## Testing

- `pickLanIp` — unit tests (node project): en0+bridge100 → en0; only-internal → null; en1-only → en1; non-mac names with a virtual iface filtered.
- `devHost.ts` builders — unit tests with `DEV_HOST` set/unset (set/restore `process.env` per test).
- Manual e2e: `pnpm dev` → localhost sign-in + upload; `pnpm dev:host` → phone sign-in + upload. (Verified live: `dev:host` produced a magic-link email pointing at the LAN IP, proving `DEV_HOST` reaches the server, with both LAN and localhost origins accepted.)

## Verification

`pnpm test:node` (new unit tests) + `pnpm check` + `tsc --noEmit`; then the two manual e2e flows above.
