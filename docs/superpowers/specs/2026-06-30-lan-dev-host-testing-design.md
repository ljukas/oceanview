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

A thin **launcher** wraps the `dev` script. When `--host` is passed it detects the primary LAN IPv4 and injects it as a **brand-new env var, `DEV_HOST`**, then spawns Vite. The app's existing env seams prefer `DEV_HOST` when present.

Why a *new* var rather than overwriting `BETTER_AUTH_URL`/`S3_ENDPOINT`: those keys exist in `.env`/`.env.local`, and whether the dev server's loader overrides a pre-set `process.env` value is undocumented (Nitro is beta). `DEV_HOST` appears in **no** `.env` file, so the loader has nothing to override it with — precedence becomes a non-issue. This is the load-bearing design decision.

Rejected alternatives: **tunnels** (ngrok/cloudflared) — for remote access, not same-Wi-Fi; rotating free-tier URLs and a second tunnel needed for the storage port. **Better Auth dynamic `baseURL`/`allowedHosts`** — Better Auth's own security guide discourages request-inference, and it wouldn't remove the storage/CORS work that forces the launcher anyway. **Overwriting existing env vars** — fragile dependence on loader internals.

## Components

Each unit has one job and a clear interface.

1. **`src/utils/lanIp.ts` — `pickLanIp(interfaces): string | null`** (pure).
   Input: `os.networkInterfaces()` output. Returns the best LAN IPv4, or `null`. Prefers `en0`→`en1` (macOS Wi-Fi/Ethernet); otherwise the first non-internal IPv4 whose interface name isn't virtual (`bridge*`, `utun*`, `vmnet*`, `vnic*`, `llw*`, `awdl*`). Pure ⇒ unit-tested in isolation. (Needed because `networkInterfaces()` also returns `bridge100 → 192.168.64.x`, a VM/Docker bridge that must not be chosen.)

2. **`scripts/dev.ts` — the launcher** (run via `tsx`, like `devQueueWorker.ts`, so it can share the `~/utils/lanIp` TS module). Both scripts route through it in `package.json`: `dev` → `tsx scripts/dev.ts`, `dev:log` → same but teeing stdout to `/tmp/oceanview-dev.log` (preserving today's behaviour). It spawns the Vite CLI inheriting stdio + the (possibly augmented) env.
   - No `--host` in argv → spawn `vite dev` with the original args. (Pure localhost; `DEV_HOST` unset.)
   - `--host` present → `pickLanIp()`; if found, set `process.env.DEV_HOST=<ip>` and log the phone URL (`http://<ip>:14500`) + the Mailpit URL (`http://<ip>:14502`); spawn `vite dev` passing through `--host` and all args. If no IP found → warn loudly and still spawn (degrades to localhost behaviour rather than blocking).

3. **`src/lib/devHost.ts` — app-side reader** (single source of truth for the dev-host URLs).
   ```ts
   const APP_PORT = 14500, STORAGE_PORT = 14523
   export const devHost = process.env.DEV_HOST || null
   export const devBaseUrl = () => devHost && `http://${devHost}:${APP_PORT}`
   export const devLanOrigins = () => devHost
     ? [`http://localhost:${APP_PORT}`, `http://127.0.0.1:${APP_PORT}`, `http://${devHost}:${APP_PORT}`]
     : []
   export const devS3Endpoint = () => devHost && `http://${devHost}:${STORAGE_PORT}`
   ```

4. **`src/lib/auth.ts` seam** — `resolveBaseURL()` returns `devBaseUrl() ?? <existing>`; `resolveTrustedOrigins()` appends `devLanOrigins()`. (Trusting localhost *and* the LAN IP means the app works from the Mac and the phone simultaneously.) The `BETTER_AUTH_TRUSTED_ORIGINS` env merge added earlier stays as a general escape hatch.

5. **`src/lib/effects/storage/adapters/s3.ts` seam** — endpoint resolves as `devS3Endpoint() ?? process.env.S3_ENDPOINT`. The selector (`storage.ts:189`) already picks s3 because `.env` always sets `S3_ENDPOINT` in dev; only the endpoint *host* changes.

6. **`compose.yaml` — RustFS CORS → `*`** (local, ephemeral, dev-only storage; presigned PUTs carry no credentials). Removes the need to recreate the storage container per IP — the launcher never touches Docker.

7. **Revert the manual LAN edits** in `.env` (`BETTER_AUTH_URL`, `S3_ENDPOINT` → `localhost`; drop the temporary `RUSTFS_CORS_ALLOWED_ORIGINS`) and `.env.local` (`BETTER_AUTH_URL` → `localhost`), so `pnpm dev` is clean localhost again.

## Data flow

`pnpm dev --host` → `scripts/dev.ts` picks `192.168.x.y`, sets `DEV_HOST`, spawns `vite dev --host` → Nitro loads `.env`/`.env.local` (localhost values) but leaves `DEV_HOST` untouched → `auth.ts` baseURL = `http://192.168.x.y:14500`, trusts localhost+LAN → s3 adapter endpoint = `http://192.168.x.y:14523` → phone hits the LAN URL, signs in via a LAN magic link (Mailpit), uploads straight to RustFS (CORS `*`), images display from the LAN storage URL. `pnpm dev` (no flag) → `DEV_HOST` unset → every seam falls back to localhost.

## Error handling / edge cases

- **No LAN IP** (offline / Wi-Fi down): launcher warns and runs Vite anyway; app behaves as localhost.
- **Ambiguous interfaces** (en0 + bridge100): `pickLanIp` ordering resolves it deterministically; unit-tested.
- **Non-macOS dev:** the `en0`/`en1` preference is a hint; the virtual-interface filter is the cross-platform fallback. Documented as best-effort.
- **`DEV_HOST` accidentally set in prod:** it's only ever injected by the launcher, never written to a committed env file; prod has no launcher. A comment in `devHost.ts` states it's dev-only.

## Testing

- `pickLanIp` — unit tests (node project): en0+bridge100 → en0; only-internal → null; en1-only → en1; non-mac names with a virtual iface filtered.
- `devHost.ts` builders — unit tests with `DEV_HOST` set/unset (set/restore `process.env` per test).
- Manual e2e (already validated once by hand today): `pnpm dev` → localhost sign-in + upload; `pnpm dev --host` → phone sign-in + HEIC upload with instant preview + GPS prefill.

## Verification

`pnpm test:node` (new unit tests) + `pnpm check` + `tsc --noEmit`; then the two manual e2e flows above.
