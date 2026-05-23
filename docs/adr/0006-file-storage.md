# ADR 0006 — File Storage (Vercel Blob, with R2 as documented fallback)

- **Status**: Accepted
- **Date**: 2026-05-22
- **Deciders**: Lukas
- **Decision in one line**: Use Vercel Blob behind a typed `src/lib/effects/storage/` adapter; clients mint a token + pathname via oRPC, PUT bytes directly to Blob, then confirm via a second oRPC call; metadata in Postgres. Cloudflare R2 stays documented as a drop-in replacement adapter — the effects seam means switching providers is a file swap, not a rewrite.

---

> **Amended 2026-05-23.** This ADR was written as a plan; implementation shipped over the following day with intentional departures. The Architecture, Verification, and Files sections were rewritten to match what landed. Decision rationale, Alternatives, Pricing, Consequences, and Revisit-triggers sections are unchanged. The load-bearing departures:
>
> - **Two Blob stores, not one** — `oceanview-public` (avatars) and `oceanview-private` (documents), with separate read-write tokens. Per-access routing inside the adapter; pathnames are also env-prefixed (`dev/`, `preview/`, `prod/`) so the same two stores serve all environments.
> - **Three-step oRPC upload flow, not `handleUpload`** — `orpc.{image|file}.mint*Upload` → browser PUTs to Blob with the client token → `orpc.{image|file}.confirm*Upload` writes the metadata row. No `handleUpload` helper, no `onUploadCompleted` webhook (which doesn't reach `localhost` in dev).
> - **No Vercel Image Optimization** — avatars render against the raw Blob CDN URL. `/_vercel/image` isn't served by Vite locally and requires Build Output API + `remotePatterns` config in prod we don't maintain; at our scale (avatars ≤ 5 MB, rendered ≤ 160 px) it isn't worth wiring. Future option: client-side resize before upload.

---

## Context

Oceanview has file storage scaffolded but **unwired**:

- `user.image` exists on the Better Auth schema (`src/lib/db/schema/betterAuth.ts:9`) but is unused — `UserCard` and `admin/users.tsx` render initials via `AvatarFallback` only.
- `src/routes/_authenticated/documents.tsx` is a placeholder for a future file library.
- `src/lib/effects/` follows the typed-adapter pattern from ADR-0001 (`email/` is the canonical template) — no `storage/` subdirectory yet.

The original decision (recorded in `CLAUDE.md`) was **Cloudflare R2, not Vercel Blob (zero egress fees)**, with the planned pattern: browser PUTs directly to R2 via a presigned URL minted server-side; Vercel functions never see file bytes; Postgres holds metadata only.

That reasoning was correct in the abstract but **overweighted for our actual workload** (10–20 users, ~1–2 GB total storage, a few GB/month egress at most). At this scale, the deciding factors are operational simplicity and how much code we want to write — not egress costs that round to zero either way. With the app already on Vercel + Neon + the Vercel Marketplace, consolidating onto Vercel Blob removes a provider account, a secret-management surface, and the hand-rolled S3 presigner we'd otherwise need to build.

The seam from ADR-0001 means the choice is **reversible**: if usage ever shifts (e.g. the document library becomes a broadly-shared archive that bumps into Hobby Blob's hard-cap behavior, or egress costs ever become meaningful), swapping to R2 is a file swap behind the existing interface — no procedures or call sites change.

This ADR captures the choice, the alternatives, the trigger conditions that would flip it back to R2, and the shape of the `effects/storage/` adapter when it lands.

---

## Decision (TL;DR)

**Use Vercel Blob, accessed through `src/lib/effects/storage/`, with client uploads as the primary path.**

Concretely:

- `src/lib/effects/storage/` follows the `email/` template: a typed `StorageEffects` interface, one adapter per backend, a barrel.
- Two adapters from day one — `adapters/vercelBlob.ts` (production, talks to both Blob stores) and `adapters/devLog.ts` (tests + offline dev). R2 lands as `adapters/r2.ts` *only if* a revisit trigger fires.
- **Two Blob stores**: `oceanview-public` (avatars) and `oceanview-private` (documents), with `BLOB_PUBLIC_READ_WRITE_TOKEN` and `BLOB_PRIVATE_READ_WRITE_TOKEN` provisioned via the Marketplace integration. The adapter picks the right token from the `access` parameter on every call.
- **Env-prefixed pathnames** — the adapter prepends `dev/`, `preview/`, or `prod/` to every pathname based on `VERCEL_ENV`. One pair of stores serves all environments with namespace isolation.
- **Three-step upload flow**, all routed through oRPC:
  1. Client calls `orpc.image.mintAvatarUpload` / `orpc.file.mintDocumentUpload` — server generates the pathname, calls `storage.mintUploadToken`, returns `{ clientToken, pathname }`.
  2. Client calls `put(pathname, file, { access, token: clientToken })` from `@vercel/blob/client` — bytes go direct to Blob.
  3. Client calls `orpc.image.confirmAvatarUpload` / `orpc.file.confirmDocumentUpload` — server runs `storage.head` to verify the blob exists, writes the metadata row (and `user.image` via `auth.api.updateUser` for avatars), publishes a realtime event.
- Bytes never traverse a Vercel Function — same architectural property as the R2 plan. Only the *coordination* runs server-side, through typed oRPC procedures.
- File metadata (`id`, `owner_id`, `pathname`, `name`, `mime`, `size_bytes`, `folder`, `access`, `uploaded_at`, `deleted_at`) lives in Postgres in a `file` table owned by `src/lib/services/file/` (ADR-0002).
- Avatars use `access: 'public'`, are stored at `avatars/{userId}/{uuid}` (per-upload UUID), and render against the raw Blob CDN URL — no Image Optimization indirection (see Architecture → Image Optimization).

The seam is the deep module: small interface (`mintUploadToken`, `head`, `delete`, `getReadUrl`), real swap-in implementations, hidden adapter-specific plumbing. The browser-side `put` from `@vercel/blob/client` is the only place outside the adapter that touches Vercel-specific code — everything else flows through `~/lib/effects`.

---

## Alternatives considered

### A. Cloudflare R2 (the original plan)
- ➕ **Free egress, always.** Cost ceiling is impossible to hit on egress. Useful if documents ever become hot or shared widely.
- ➕ More generous storage free tier (10 GB-month vs. Vercel's smaller Hobby quota that's *shared* with other Vercel services).
- ➕ S3-compatible API — vendor-portable. Moving off Vercel later doesn't touch the storage layer.
- ➕ **Won't stop serving** when the free tier is exceeded — bills you instead. Better for a "this app must work" posture than Hobby Blob's hard cutoff.
- ➖ **Second provider account.** Another set of API keys (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) to rotate, audit, and document.
- ➖ **More code to write**: AWS SDK v3 (or `aws4fetch`) presigner, completion endpoint, signed-read URLs for private documents. There is no R2-native client-upload helper — the two-step (mint URL → confirm) flow is yours to build.
- ➖ Manual env-var setup (not auto-provisioned by the Vercel Marketplace).
- ➖ No first-class dashboard inside Vercel for usage/inspection.
- **Verdict**: correct for a workload where egress would actually matter. Wrong tradeoff for 20 users. Kept available as a fallback adapter; documented trigger conditions below.

### B. Vercel Blob (chosen)
- ➕ **One provider, one bill, one dashboard surface.** Marketplace integration auto-provisions a `BLOB_READ_WRITE_TOKEN` per store; we rename to `BLOB_PUBLIC_*` / `BLOB_PRIVATE_*` to support the two-store split (see Decision).
- ➕ **First-party client-upload SDK** with `@vercel/blob/client.upload()` — built-in presigning, token-minting, and `onUploadCompleted` callback. Materially less code than rolling R2 + S3 SDK + presigner.
- ➕ Public + private access in one API; private files served via `get()` from a Function when ACL is needed (avatars stay public; documents likely stay private).
- ➕ Auto-CDN — Blob Data Transfer uses Vercel's edge network without extra config.
- ➕ Plays well with the existing effects pattern — `adapters/vercelBlob.ts` is a thin wrapper.
- ➖ **Egress is paid** ($0.05/GB Blob Data Transfer past the Pro 100 GB include). Negligible at our scale, but a real cost cliff if documents ever go public/viral. Trigger documented below.
- ➖ **Hobby quota is shared and hard-capped.** If Blob hits its limit, it stops serving for up to 30 days. Avatars and documents both go dark — not just the offending feature. This is the only Blob property that meaningfully argues for R2 at our scale.
- ➖ Dashboard interactions count as operations. A handful of admin clicks can quietly burn Advanced Operations quota.
- ➖ **Vendor lock-in.** The SDK isn't S3-compatible. A future migration requires rewriting the storage adapter (which is exactly what the `effects/storage/` indirection is for).
- ➖ Multipart uploads cost more per upload (each part = 1 Advanced Op).
- **Verdict**: chosen. The "less code + one provider" gains outweigh the egress and hard-cap concerns at this scale. Hard-cap risk is mitigated by quota observability + the fast adapter-swap escape hatch.

### C. Both at once (R2 for documents, Blob for avatars)
- ➕ Avatars stay close to Vercel Image Optimization with zero config; documents get free egress.
- ➖ Two adapters in production from day one for orthogonal reasons; two sets of secrets; two failure modes; two billing dashboards. The cognitive cost is real, the benefit is hypothetical (we don't have a document workload that benefits from free egress yet).
- **Verdict**: don't. Pick one default; let the seam carry the second when there's a real reason.

### D. Supabase Storage / S3 directly / Backblaze B2
- ➕ All viable; all S3-compatible (Supabase, B2 are; S3 itself is).
- ➖ Either a third vendor account (Supabase / B2) or AWS billing complexity (S3). Same con as R2 (second provider) without R2's free-egress upside.
- **Verdict**: don't. R2 remains the documented fallback; no need to consider others until R2 itself is exhausted.

### E. Self-host (MinIO on a VPS)
- ➕ Total control. Free egress (modulo bandwidth caps).
- ➖ Adds the only piece of infrastructure Oceanview currently lacks (a server to babysit). Conflicts with the "free tier first, no ops burden" posture in CLAUDE.md.
- **Verdict**: don't. Not until Oceanview becomes a different kind of project.

---

## Architecture

### The `src/lib/effects/storage/` namespace

Mirrors `src/lib/effects/email/`. Where `email/` owns SMTP transport, `storage/` owns object storage:

```
src/lib/effects/
  index.ts                          barrel — re-exports effects.email, effects.storage, …
  storage/
    index.ts                        barrel
    storage.ts                      typed interface + adapter selector
    adapters/
      vercelBlob.ts                 production adapter — talks to both Blob stores (per-access token), env-prefixes pathnames
      devLog.ts                     no-op adapter (logs + stub return values; used in tests + offline dev)
    storage.test.ts                 interface contract test against devLog
```

The adapter selector picks `vercelBlob` when both `BLOB_PUBLIC_READ_WRITE_TOKEN` and `BLOB_PRIVATE_READ_WRITE_TOKEN` are set, `devLog` otherwise. The future R2 adapter would land as `adapters/r2.ts` with no other changes; the selector would prefer R2 when `R2_*` env vars are set.

### The seam

```ts
// src/lib/effects/storage/storage.ts
export interface StorageEffects {
  /**
   * Mint a short-lived client token. `access` selects which store (and token).
   * The input `pathname` is logical (e.g. `avatars/{userId}/{uuid}`); the
   * adapter env-prefixes it and returns the *prefixed* pathname the browser
   * must pass back into `put` (the token is scoped to that exact value).
   */
  mintUploadToken(input: {
    access: 'public' | 'private'
    pathname: string
    contentType: string
    maxBytes: number
  }): Promise<{ clientToken: string; pathname: string }>

  /** Existence + metadata check. Returns null when the blob does not exist. */
  head(access: 'public' | 'private', pathname: string): Promise<{
    url: string
    contentType: string
    size: number
  } | null>

  delete(access: 'public' | 'private', pathname: string): Promise<void>

  /** Signed time-limited download URL for a private-store object. */
  getReadUrl(pathname: string, ttlSeconds: number): Promise<string>
}

export const storage: StorageEffects = pickAdapter()
```

The interface is **intentionally backend-neutral**: `mintUploadToken` returns a token the browser passes into `put(pathname, file, { access, token })` from `@vercel/blob/client`. For R2 the equivalent shape: `mintUploadToken` would return a presigned PUT URL the browser PUTs to directly, and `head` would be an S3 HEAD against the bucket — same surface, different implementation.

### The byte-path

```
Client                                   Server (oRPC)                          Vercel Blob
──────                                   ─────────────                          ───────────
1. handleFile(file)
   └─ orpc.image.mintAvatarUpload  ───►  procedure
   (or file.mintDocumentUpload)          · session + Zod validation
                                         · generate pathname (server-owned)
                                         · storage.mintUploadToken(...)
                                         · return { clientToken, pathname }
2. put(pathname, file, { access, token })  ─────────────────────────────────►  PUT bytes
                                                                               ◄─ { url, contentType, ... }
3. orpc.image.confirmAvatarUpload  ───►  procedure
   (or file.confirmDocumentUpload)       · storage.head(access, pathname) — verify
                                         · avatar: replaceAvatarForUser + delete previous blobs
                                                   + auth.api.updateUser({ image })
                                           document: fileService.confirmUpload(...)
                                         · realtime.publish({ kind: 'user.changed' | 'file.changed' })
4. invalidateQueries(...)
```

Two oRPC procedure calls (mint + confirm) bracket the direct PUT to Blob. **Bytes never traverse a Vercel Function**, same architectural property the original R2 plan wanted. The mint procedure owns the pathname (browser can't choose where bytes land); the confirm procedure verifies the blob exists via `storage.head` (a fake-confirm with no actual upload is rejected) and re-checks ownership (`pathname.includes('avatars/{userId}/')` for avatars).

Why three steps instead of Vercel's `handleUpload` helper: `handleUpload` uses a webhook callback (`onUploadCompleted`) that requires Blob's servers to POST back to the app's URL after the upload completes. That doesn't reach `localhost` in dev, and on production it adds a round-trip. Our three-step shape is webhook-free, client-driven, and reuses the project's standard oRPC mutation pattern.

### Metadata service — `src/lib/services/file/`

Follows ADR-0002. Owns the `file` Postgres table (holds rows for both avatars and documents — the `access` column discriminates):

```ts
// src/lib/db/schema/file.ts
export const fileAccessEnum = pgEnum('file_access', ['public', 'private'])

export const file = pgTable('file', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  pathname: text('pathname').notNull().unique(),       // env-prefixed; the canonical handle
  name: text('name').notNull(),                        // original filename
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  folder: text('folder'),                              // null = root (private only)
  access: fileAccessEnum('access').notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => [
  index('file_owner_id_idx').on(table.ownerId),
  index('file_access_idx').on(table.access),
])
```

No `blobUrl` column — `pathname` is the canonical handle. Private read URLs are minted on demand via `storage.getReadUrl(pathname, ttl)`; public read URLs come from `storage.head().url` at confirm time (and for avatars, are persisted to `user.image` via Better Auth's update API).

Operations: `confirmUpload`, `listAllDocuments` (shared library, joined with uploader name), `replaceAvatarForUser` (transactional: insert new public row + soft-delete previous public rows + return previous pathnames for blob cleanup), `softDelete` (owner-or-admin gate; rejects when called on a public row), `findById`, `findActiveById`.

`FileDomainError` codes: `NOT_FOUND`, `CANNOT_DELETE_OTHERS_FILE`, `CANNOT_DELETE_AVATAR_VIA_DOCUMENT_DELETE`. Size + MIME validation happens at the procedure layer (Zod) before reaching the service.

### Avatars

`user.image` is the Better Auth-managed column for the user's profile picture URL. Avatars use the same `effects.storage` interface with `access: 'public'`, a pathname of `avatars/{userId}/{uuid}` (server-generated UUID per upload — not a stable per-user path), max 5 MB, and a MIME allowlist (`image/jpeg`, `image/png`, `image/webp`). Bound by the `imageRouter` procedures.

**Per-upload pathnames** mean each new avatar lands at a fresh URL. `replaceAvatarForUser` (the service helper) soft-deletes any previously active public row for that user and returns their pathnames; the confirm procedure then calls `storage.delete('public', p)` for each. Net effect: one live avatar per user, every replacement gets a fresh URL automatically — no `?v=` cache-busting tricks.

**`user.image` update goes through Better Auth.** The confirm procedure calls `auth.api.updateUser({ body: { image: blob.url }, headers: context.headers })`. Better Auth's update endpoint writes the DB *and* refreshes the session `session_data` cookie (the cookie cache from `src/lib/auth.ts`). A direct `db.update(user).set({ image })` would leave the cookie cache stale for up to 5 minutes — already learned that the hard way.

**Rendering**: `<AvatarImage src={user.image}>` against the raw Vercel Blob CDN URL. No `/_vercel/image` indirection — see Image Optimization below.

### Documents

Documents (private store) work the same shape — `fileRouter.mintDocumentUpload` + `fileRouter.confirmDocumentUpload` — with a higher size cap (25 MB) and a broader MIME allowlist (PDFs, images, Word). Pathname format: `documents/{folder?}/{uuid}-{safeFilename}`.

**Shared library, not per-owner**: every signed-in user sees all non-deleted document rows via `fileRouter.listDocuments` (joins `file` with `user` to surface the uploader's name). Only the owner or an admin can delete (`fileRouter.deleteDocument` → `fileService.softDelete` enforces it). Download is a 302-redirect route (`/api/files/download/$id`) that mints a 60-second signed URL via `storage.getReadUrl` after the session check — `<a href={...}>` lets the browser handle the file fetch natively.

### Image Optimization — deferred

The original plan called for `/_vercel/image?url=...&w=...&q=80` to deliver resized avatars. We dropped this during implementation:

- `/_vercel/image` is a Vercel-platform endpoint. **It doesn't exist on the Vite dev server** — the URL falls through to the SPA fallback and renders broken.
- Production needs `remotePatterns` allowlisting our Blob hostnames (`*.public.blob.vercel-storage.com`) in a Build Output API `images` config, which we don't maintain. Without that, the endpoint refuses to optimize our URLs.
- Avatars are small (≤ 5 MB, mostly < 500 KB) and rendered at 20–160 px. Browsers downscale fine; the byte-savings from server-side resize wouldn't pay for the platform-integration work at our scale.

We render `<AvatarImage src={user.image}>` directly against the raw Vercel Blob CDN URL. Works identically in local dev and on Vercel, no config.

**Future option** (out of scope today): client-side resize before upload — a `canvas` / `createImageBitmap` step in `AvatarUpload.handleFile` that downscales to e.g. 256×256 WebP before `put()`. Bounds stored byte size at the source, no platform integration needed.

### Why this is a deep module (in the architecture-skill's terms)

- **Interface**: 4 typed functions (`mintUploadToken`, `head`, `delete`, `getReadUrl`). Stable across backends.
- **Implementation**: hides per-access token routing, env-prefixing, token minting, signed-URL generation, blob existence checks. The procedure layer never imports `@vercel/blob`; the *browser* side calls `put` from `@vercel/blob/client` (necessary — that's the upload SDK), but the procedures and services see only the interface.
- **Two real adapters from day one** (`vercelBlob` + `devLog`) — the seam is real, not hypothetical, and passes ADR-0001's "deletion test".
- **Test surface = the interface**: services + procedures use the `devLog` adapter in tests; we don't mock Blob, we have a real second implementation.

---

## Pricing reference (point-in-time, verified 2026-02-27 / 2026-03-04)

Kept in this ADR so the trigger conditions below are interpretable later.

### Vercel Blob — Pro plan (Hobby quotas are smaller and shared with other Vercel services)

| Resource | Pro included | Pro overage |
|---|---|---|
| Storage | 5 GB-month | $0.023/GB-month |
| Simple ops (cache MISS, `head()`) | 100K | $0.40/1M |
| Advanced ops (`put`/`copy`/`list`) | 10K | $5.00/1M |
| Blob Data Transfer (downloads) | 100 GB | $0.05/GB |
| Edge Requests | 10M | standard CDN |
| Fast Origin Transfer (cache MISS) | 100 GB | $0.06/GB |

Notes: `del()` is free; dashboard browsing counts as Advanced Ops; multipart uploads count as multiple ops (1 start + 1/part + 1 complete); cache limit is 512 MB per blob (larger blobs MISS on every access).

### Cloudflare R2 — fallback reference

| Resource | Free tier | Paid |
|---|---|---|
| Storage | 10 GB-month | $0.015/GB-month |
| Class A ops (PUT/POST/LIST) | 1M/month | $4.50/1M |
| Class B ops (GET/HEAD) | 10M/month | $0.36/1M |
| **Egress** | **Free, always** | **Free, always** |

---

## Verification

A reader can confirm the architecture is being followed without running anything:

- `grep -rn "from '@vercel/blob" src/` — server SDK (`@vercel/blob`) imported only by `src/lib/effects/storage/adapters/vercelBlob.ts`. Browser SDK (`@vercel/blob/client`) imported only by the two upload components (`AvatarUpload.tsx`, `DocumentUpload.tsx`) — they're the only places that call `put`. Anywhere else is a violation.
- `grep -rn "BLOB_PUBLIC_READ_WRITE_TOKEN\|BLOB_PRIVATE_READ_WRITE_TOKEN" src/` — should match only `adapters/vercelBlob.ts`. The tokens aren't read elsewhere.
- `grep -rn "handleUpload\|handleUploadUrl\|onUploadCompleted" src/` — zero hits. We don't use Vercel's webhook helper.
- `grep -rn "imageOptUrl\|/_vercel/image\|lib/imageOpt" src/` — zero hits. Image Optimization isn't wired.
- `grep -rn "db\.\(select\|insert\|update\|delete\)" src/lib/effects/storage/` — zero hits. Storage adapters don't touch the DB; metadata writes are the `file` service's job (ADR-0002).
- `grep -rn "console\." src/lib/effects/storage/` — zero hits. Logging via `~/lib/logger` (ADR-0003).
- The `file` service's tests cover invariants without instantiating any storage adapter — the schema-per-test harness (`test/setup.ts`) is enough; storage calls are exercised against the `devLog` adapter via `STORAGE_ADAPTER=devLog`.

Manual smoke tests:

1. **`/konto`** — upload an avatar (JPEG, ~200 KB). DevTools Network shows three calls bracketing the byte transfer: `POST /api/rpc` (`image.mintAvatarUpload`) → `PUT https://{publicStoreId}.public.blob.vercel-storage.com/dev/avatars/{userId}/{uuid}` → `POST /api/rpc` (`image.confirmAvatarUpload`). The avatar renders immediately; `user.image` in Postgres holds the Blob URL; the `oceanview-public` dashboard shows a new object under `dev/avatars/...`.
2. **Avatar replacement** — upload a second avatar. The previous blob disappears from the public store dashboard; the previous `file` row is soft-deleted; `user.image` now points at the new URL (cookie cache refreshes because we go through `auth.api.updateUser`).
3. **`/documents`** — upload a PDF as user A. Same three-call DevTools pattern against `file.mintDocumentUpload` + `PUT https://{privateStoreId}.private.blob.vercel-storage.com/...` + `file.confirmDocumentUpload`. Metadata row appears, file appears in the list, realtime event propagates to a second tab.
4. **Shared library** — sign in as user B in another browser. User B sees A's document and can download it via `/api/files/download/{id}` (302 redirect to a 60-second signed URL). User B does NOT see a delete button on A's row; calling `orpc.file.deleteDocument({ id })` directly returns the Swedish `CANNOT_DELETE_OTHERS_FILE`-mapped error. As an admin, the delete succeeds.
5. **Privacy** — `curl -I` the private store URL directly without a signed URL → 401/403. `curl -I` the public store URL → 200.
6. **Quota visibility** — confirm both Vercel Blob dashboards show usage; configure alerts at ~80% of the Hobby quota (the primary mitigation for the hard-cap risk).
7. **`pnpm test`** — colocated tests pass (91/91 at the time of writing); storage tests use the `devLog` adapter and never make a live Blob call.

---

## Files

**New** (added while wiring this ADR):
- `src/lib/effects/storage/storage.ts` — interface + adapter selector.
- `src/lib/effects/storage/adapters/vercelBlob.ts` — production adapter; per-access token routing; env-prefixed pathnames; uses `@vercel/blob` server SDK (`del`, `head`, `issueSignedToken`, `presignUrl`) + `@vercel/blob/client.generateClientTokenFromReadWriteToken`.
- `src/lib/effects/storage/adapters/devLog.ts` — test/dev adapter; stub returns.
- `src/lib/effects/storage/index.ts` — barrel.
- `src/lib/effects/storage/storage.test.ts` — interface contract test against devLog.
- `src/lib/services/file/file.ts`, `errors.ts`, `file.test.ts`, `index.ts` — file metadata service (ADR-0002).
- `src/lib/db/schema/file.ts` — `file` table + `fileAccessEnum`.
- `src/lib/orpc/procedures/image.ts` — `imageRouter` (`mintAvatarUpload`, `confirmAvatarUpload`).
- `src/lib/orpc/procedures/file.ts` — `fileRouter` (`mintDocumentUpload`, `confirmDocumentUpload`, `listDocuments`, `deleteDocument`).
- `src/routes/api/files/download.$id.ts` — auth-gated 302 redirect to a signed Blob URL for private documents.
- `src/components/user/AvatarUpload.tsx` — three-step upload flow against `imageRouter`.
- `src/components/document/DocumentUpload.tsx` — three-step upload flow against `fileRouter`.
- `src/components/document/DocumentList.tsx` — shared library with owner-or-admin delete buttons.

**Modified**:
- `src/lib/effects/index.ts` — added `storage` export.
- `src/lib/effects/realtime/types.ts` — added `file.changed` event kind.
- `src/lib/db/schema/index.ts` — re-exported the `file` table.
- `src/lib/services/user/user.ts` — added `image` to `UserRow` + `userSelection`.
- `src/lib/orpc/router.ts` — mounted `imageRouter` and `fileRouter`.
- `src/routes/_authenticated/documents.tsx` — replaced the placeholder with `<DocumentUpload>` + `<DocumentList>`.
- `src/routes/_authenticated/konto.tsx` — added the `<AvatarUpload>` section.
- `src/components/user/UserCard.tsx`, `src/components/contact/ContactCard.tsx`, `src/routes/_authenticated/admin/users.tsx` — render `<AvatarImage src={image}>` when present, falling back to initials.
- `.env.example` — added `BLOB_PUBLIC_READ_WRITE_TOKEN` + `BLOB_PRIVATE_READ_WRITE_TOKEN` + optional `STORAGE_ADAPTER` override.
- `CLAUDE.md` — flipped the "file storage" decision line; added `image.ts` and `file.ts` to the procedures section; added `BLOB_*` to the env section.
- `package.json` — added `@vercel/blob` dependency.
- `drizzle/0003_add_file_table.sql` — migration generated by drizzle-kit.

**Not wired** (called out so future readers know it was considered, then dropped):
- ~~`src/routes/api/files/upload.ts`~~ — the `handleUploadUrl` route from the original plan. Replaced by `image.{mint,confirm}AvatarUpload` + `file.{mint,confirm}DocumentUpload` oRPC procedures.
- ~~`src/lib/imageOpt.ts`~~ — `imageOptUrl(src, w, q)` helper. Removed (see Image Optimization — deferred).

---

## Consequences

**Positive**:
- One provider for compute, DB (via Marketplace integration), and storage. One bill, one dashboard pair, one secret-rotation surface.
- The Vercel Blob SDKs (server `@vercel/blob` + browser `@vercel/blob/client`) collapse the integration to ~150 LOC total across the adapter, the four upload procedures, and the two upload components — compact for what's wired (token minting, signed URLs, two-store routing, env-prefixed pathnames).
- The `effects/storage/` seam keeps the choice reversible — swapping to R2 is bounded to one new file (`adapters/r2.ts`) and a one-line selector change. Procedures and components stay the same.

**Negative**:
- Egress is paid past the included quota. At our scale this is rounding error; at a different scale it would matter.
- Hobby Blob's hard-cap behavior is a real operational hazard for a "this app must work for our co-owners" posture. Mitigated by: (a) quota observability via the Vercel dashboard, (b) email alerts at ~80% usage, (c) the cheap adapter-swap escape hatch documented here.
- Vendor lock-in to the Vercel Blob SDK shape. Acceptable because the `effects/storage/` interface is what consumers depend on, and that interface is backend-neutral by design.

**Revisit triggers** — re-open this ADR (and likely swap to R2) if any of these change:

1. **Blob quota becomes a recurring concern.** If we hit ≥60% of the Hobby Blob quota in two consecutive months, switch — R2's "keep serving, bill you" model is the safer posture.
2. **Documents become broadly shareable.** If the document library ever serves files to non-users (e.g. a public archive, or files shared with third parties via signed URLs), R2's free egress becomes a material cost saving and a peace-of-mind property.
3. **A second provider is added anyway.** If we end up needing R2 for another reason (e.g. a feature that requires S3-compatible APIs), consolidate storage there and retire the Blob adapter — fewer billing surfaces wins.
4. **Vercel Image Optimization pricing changes meaningfully.** The current Hobby tier is comfortable; if it shrinks to where ~20 users could hit it, evaluate Cloudflare Image Resizing (which pairs naturally with R2) as an alternative.
5. **The project leaves Vercel.** If hosting ever moves, R2 + a self-hosted image transformer is the portable shape; do the swap at that point.

The cost of being wrong is bounded: the seam is the whole point. The cost of *not deciding* — leaving R2 as the documented plan while everything else consolidates around Vercel — is more concrete: every new dev needs to learn two backends' setup paths to understand the codebase, and the "wire R2 next" item on the deferred-work list grows stale.
