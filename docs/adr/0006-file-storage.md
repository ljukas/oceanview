# ADR 0006 — File Storage (Vercel Blob, with R2 as documented fallback)

- **Status**: Accepted
- **Date**: 2026-05-22
- **Deciders**: Lukas
- **Decision in one line**: Use Vercel Blob behind a typed `src/lib/effects/storage/` adapter; client uploads via `@vercel/blob/client.upload` + a `handleUploadUrl` route; metadata in Postgres. Cloudflare R2 stays documented as a drop-in replacement adapter — the effects seam means switching providers is a file swap, not a rewrite.

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

**Use Vercel Blob, accessed through `src/lib/effects/storage/`, with client-uploads as the primary path.**

Concretely:

- New `src/lib/effects/storage/` follows the `email/` template: a typed `StorageEffects` interface, one adapter per backend, a barrel.
- Two adapters from day one — `adapters/vercelBlob.ts` (production) and `adapters/devLog.ts` (tests + offline dev). R2 lands as `adapters/r2.ts` *only if* a revisit trigger fires.
- Browser uploads use `@vercel/blob/client.upload(file, { handleUploadUrl: '/api/files/upload' })`. A `handleUploadUrl` route mints a short-lived token and runs the `onUploadCompleted` callback to write the metadata row through the `file` service.
- Bytes never traverse a Vercel Function — the byte path is browser ↔ Blob direct. The function only mints tokens and persists metadata. (Same architectural property the original R2 plan was after.)
- File metadata (id, owner, name, mime, size, blob_url, folder, uploaded_at) lives in Postgres in a new `file` table, owned by a new `src/lib/services/file/` service following ADR-0002.
- Avatars use the same flow with a smaller size limit; `<img src="/_vercel/image?url={user.image}&w=128&q=80">` for delivery (see "Image Optimization" below).

The seam is the deep module: small interface (`mintUploadToken`, `delete`, `getReadUrl`), real swap-in implementations, hidden adapter-specific plumbing. Procedures and routes import from `~/lib/effects` only — never from `@vercel/blob` directly.

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
- ➕ **One provider, one bill, one dashboard.** Auto-provisioned env var (`BLOB_READ_WRITE_TOKEN`) via the Vercel Marketplace.
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
      vercelBlob.ts                 production adapter (used when BLOB_READ_WRITE_TOKEN is set)
      devLog.ts                     no-op adapter (returns placeholder URLs, logs payloads — used in tests + offline dev)
    storage.test.ts                 interface contract test against devLog
```

The future R2 adapter would land as `adapters/r2.ts` with no other changes; the selector in `storage.ts` would prefer R2 when `R2_*` env vars are set.

### The seam

```ts
// src/lib/effects/storage/storage.ts
export interface StorageEffects {
  /** Mint a short-lived token the browser uses to PUT directly to the store. */
  mintUploadToken(input: {
    pathname: string                 // e.g. 'avatars/{userId}.webp' or 'documents/{folder}/{filename}'
    contentType: string
    maxBytes: number
    access: 'public' | 'private'
  }): Promise<{ token: string; uploadUrl?: string }>

  /** Server-side delete (used when a metadata row is removed). */
  delete(pathname: string): Promise<void>

  /** Server-mints a time-limited read URL for a private object. Public objects have a stable URL stored on the metadata row. */
  getReadUrl(pathname: string, ttlSeconds: number): Promise<string>
}

export const storage: StorageEffects = pickAdapter()
```

The interface is **intentionally backend-neutral**: `mintUploadToken` returns whatever the adapter needs (Blob returns a token used by `@vercel/blob/client.upload`; R2 would return a presigned URL the browser PUTs to directly). Callers don't care.

### The byte-path (Vercel Blob adapter)

```
Browser
  └─ <input type="file"> selects a file
  └─ upload(file, { handleUploadUrl: '/api/files/upload' })  ─► POST /api/files/upload
                                                                  │
                                                                  └─ /api/files/upload  (Vercel Function)
                                                                       │  validates the caller (session, MIME, size)
                                                                       │  calls effects.storage.mintUploadToken(...)
                                                                       │  returns { token } to the client
                                                                       ▼
  └─ Browser PUTs bytes directly to Vercel Blob with the token  (bytes never re-enter our Function)
                                                                       ▼
                                                                  Blob calls back to /api/files/upload's onUploadCompleted
                                                                       │  Vercel Function inserts the metadata row via `file` service
                                                                       │  publishes a `files.changed` realtime event (ADR-0004)
```

Two HTTP hops to the Function (token mint + completion callback); zero bytes through the Function. The architectural property the original R2 plan wanted is preserved.

For R2 the equivalent shape: `mintUploadToken` returns a presigned `PUT` URL (signed with AWS SigV4 via the `aws4fetch` library — no full AWS SDK required), the browser PUTs to that URL, then makes a separate `confirmUpload` oRPC call to persist the metadata row. R2 has no completion callback, so the confirmation step is the client's responsibility — which is one of the things that makes Blob's flow less code today.

### Metadata service — `src/lib/services/file/`

Follows ADR-0002. Owns the `file` Postgres table:

```ts
// src/lib/db/schema/file.ts (sketch — when wired)
export const file = pgTable('file', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => user.id),
  pathname: text('pathname').notNull().unique(),       // e.g. 'documents/sailing/may-route.pdf'
  blobUrl: text('blob_url').notNull(),                 // stable URL when public; opaque key when private
  name: text('name').notNull(),                        // original filename
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  folder: text('folder'),                              // null = root
  access: text('access', { enum: ['public', 'private'] }).notNull(),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
})
```

Service invariants land as they're discovered (`<entity>DomainError` per ADR-0002). Likely starters: `CANNOT_OVERWRITE_OTHERS_FILE`, `FILE_TOO_LARGE`, `MIME_NOT_ALLOWED` for documents.

### Avatars

`user.image` already exists on the Better Auth schema. Avatar uploads use the same `effects.storage` interface with `access: 'public'`, a `pathname` of `avatars/{userId}` (no extension — the adapter appends one from MIME), and a tighter `maxBytes` (e.g. 1 MB) + MIME allowlist (`image/jpeg`, `image/png`, `image/webp`).

The completion callback writes the resulting `blobUrl` straight to `user.image` via the existing `user` service (an admin-equivalent self-update operation — to design when the feature lands). Rendering uses `<AvatarImage src={imageOptUrl(user.image, 128)} />`, where `imageOptUrl(src, width)` returns `/_vercel/image?url=${encodeURIComponent(src)}&w=${width}&q=80`.

### Image Optimization (Vercel)

Vercel Image Optimization is framework-agnostic at the URL level — `/_vercel/image?url=<source>&w=<width>&q=<quality>` works without a `<Image>` component, which matters because we run TanStack Start, not Next.js.

- **Hobby quotas** (verified 2026-02-23): 5,000 transformations/month, 300,000 cache reads, 100,000 cache writes. Over-limit on Hobby: new transformations return HTTP 402, **previously cached transforms keep working**, no automatic charges. (Contrast: Blob's hard cutoff stops the whole store.)
- **Format requirements**: source must be JPEG/PNG/WebP/AVIF; max 8192×8192 source; max 10 MB transformed output.
- **It works with any source URL** (not Blob-exclusive). If we ever switch the storage adapter to R2, we add R2's public domain to Image Optimization's allowed `remotePatterns` — one config line, identical DX.
- **Commercial-use caveat**: Vercel's Fair Use Policy restricts Hobby plans to non-commercial personal use. Oceanview is a private co-ownership coordination app and falls under that — same rule we already live under for Hobby compute. Not a blocker, but worth flagging.

For Oceanview's actual workload (20 avatars + occasional document thumbnails), 5,000 transformations/month is essentially infinite — the cache is sticky and source images change rarely.

### Why this is a deep module (in the architecture-skill's terms)

- **Interface**: 3 typed functions. Stable across backends.
- **Implementation**: hides token minting, presigning, completion callback wiring, MIME validation, pathname normalization, ACL semantics. The consumer never imports `@vercel/blob`.
- **Two real adapters from day one** (`vercelBlob` + `devLog`) — the seam is real, not hypothetical, and passes ADR-0001's "deletion test".
- **Test surface = the interface**: services + procedures use the `devLog` adapter; we don't mock Blob, we have a real second implementation.

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

- `grep -rn "from '@vercel/blob" src/` — should match only `src/lib/effects/storage/adapters/vercelBlob.ts`. Anything else is a violation; procedures and routes consume the effects barrel.
- `grep -rn "import.*storage.*from.*~/lib/effects" src/` — finds every consumer of the storage seam; should be a small, named set (`src/routes/api/files/upload.ts`, `src/lib/orpc/procedures/files.ts`, the future avatar upload procedure).
- `grep -rn "BLOB_READ_WRITE_TOKEN" src/` — should match only `src/lib/effects/storage/adapters/vercelBlob.ts`. The token isn't read elsewhere.
- `grep -rn "db\.\(select\|insert\|update\|delete\)" src/lib/effects/storage/` — zero hits. Storage adapters don't touch the DB; metadata writes are the `file` service's job (ADR-0002).
- `grep -rn "console\." src/lib/effects/storage/` — zero hits. Logging via `~/lib/logger` (ADR-0003).
- The `file` service's tests cover invariants without instantiating any storage adapter — the schema-per-test harness (`test/setup.ts`) is enough; storage calls are exercised by the procedure-level tests using the `devLog` adapter.

Manual smoke tests after the implementation lands:

1. **`/konto`** — upload an avatar (JPEG, ~200 KB). Verify: (a) upload completes without the browser touching `/api/rpc` for the bytes (DevTools Network shows direct upload to a Blob endpoint), (b) the metadata row appears in Postgres, (c) `<AvatarImage>` renders the optimized variant, (d) the Vercel Blob dashboard shows 1 Advanced Op + ~200 KB stored.
2. **`/documents`** — upload a PDF. Verify: (a) bytes don't pass through our Function (Network tab), (b) the metadata row appears, (c) clicking the file fetches via the signed read URL and the download works, (d) `realtime.publish('files.changed')` propagates to other tabs (ADR-0004).
3. **Delete via UI** — verify both the metadata row and the blob are gone (`del()` is free; safe to test).
4. **Quota visibility** — confirm the Vercel dashboard's Blob usage page is showing storage + ops correctly, and that an alert email arrives at ~80% of Hobby quota. (This is the primary mitigation for the hard-cap risk.)
5. **`pnpm test`** — colocated tests pass; storage tests use the `devLog` adapter and never make a live Blob call.

---

## Critical files (when wired — not part of this ADR)

**New**:
- `src/lib/effects/storage/storage.ts` — interface + adapter selector.
- `src/lib/effects/storage/adapters/vercelBlob.ts` — production adapter.
- `src/lib/effects/storage/adapters/devLog.ts` — test/dev adapter.
- `src/lib/effects/storage/index.ts` — barrel.
- `src/lib/effects/storage/storage.test.ts` — interface contract test.
- `src/lib/services/file/` — `file.ts`, `errors.ts` (when first invariant lands), `file.test.ts`, `index.ts` (per ADR-0002).
- `src/lib/db/schema/file.ts` — file metadata table.
- `src/lib/orpc/procedures/file.ts` — `list`, `delete`, `confirmUpload`. Thin per ADR-0002; no inline auth checks; maps `FileDomainError` → `ORPCError`.
- `src/routes/api/files/upload.ts` — `handleUploadUrl` route Blob calls from the client + the completion callback that persists metadata.

**Modified**:
- `src/lib/effects/index.ts` — add `storage` to the barrel.
- `src/lib/db/schema/index.ts` — re-export the `file` table.
- `src/lib/orpc/router.ts` — mount the `file` sub-router.
- `src/routes/_authenticated/documents.tsx` — replace the placeholder.
- `src/components/user/UserCard.tsx` and `src/routes/_authenticated/admin/users.tsx` — render `<AvatarImage src={imageOptUrl(user.image)} />` when present, falling back to initials.
- `.env.example` — document `BLOB_READ_WRITE_TOKEN` (Marketplace-provisioned).
- `CLAUDE.md` — flip the "Decisions made" file-storage line to point at this ADR; update the Deferred work section (remove R2, add Blob); update the `documents.tsx` description in the code map.

---

## Consequences

**Positive**:
- One provider for compute, DB (via Marketplace integration), and storage. One bill, one dashboard, one secret rotation surface.
- The first-party client-upload SDK collapses the upload flow to ~30 LOC across the route + adapter (vs. ~120 LOC for an R2 presigner + confirm endpoint + signing logic).
- Image Optimization Just Works for avatars without `remotePatterns` config.
- The `effects/storage/` seam keeps the choice reversible — swapping to R2 is bounded to one new file (`adapters/r2.ts`) and a one-line selector change.

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
