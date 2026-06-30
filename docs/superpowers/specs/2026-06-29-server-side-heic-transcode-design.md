# Design — Server-side HEIC transcode worker

**Date**: 2026-06-29
**Status**: Design approved; ready for implementation plan
**Relates to**: ADR-0006 (file storage), ADR-0007 (background jobs), ADR-0010 (documents), ADR-0012 (recommended places)

## Context & problem

iOS shoots HEIC. Browsers (except Safari) can't render HEIC in an `<img>`, and our
upload mint allow-list accepts only `jpeg/png/webp/avif`, so today the client
transcodes HEIC→JPEG **in the browser** with `heic-to` (libheif wasm, ~3 MB)
**before** uploading. This runs on the main thread and **freezes the UI for
several seconds** on a phone-sized HEIC (observed live: the recommendation
editor's photo tile only appears after the transcode finishes, with no feedback
during the gap). The `heic-to` wasm is also a ~3 MB client payload.

Client-side transcode is used in exactly two flows: **recommendation photos**
(`src/components/recommendation/PhotoUploader.tsx`) and **avatars**
(`src/components/user/AvatarUpload.tsx`). Documents do **not** transcode — the
library stores the user's file as-is, and HEIC documents simply get no thumbnail
(the `image_thumbnail`/`blurhash` workers skip them via a MIME gate).

**Goal**: move the HEIC→JPEG transcode off the client to a backend queue worker,
so uploads are instant (no freeze) and the client bundle drops `heic-to`. EXIF
reading stays client-side (it's fast and drives the instant map-pin pre-fill and
the pending preview).

This fits ADR-0006: raw bytes still never traverse a Function on the *upload*
path (browser → storage direct); the worker reading bytes from storage and
writing a derived/replacement asset back is the **sanctioned "derived-asset
worker" exception** (same shape as the existing `image_thumbnail`/`blurhash`
workers).

## Goals / non-goals

**Goals**
- Eliminate the client-side transcode freeze for HEIC in the avatar + recommendation flows.
- Remove `heic-to` from the client bundle.
- Give HEIC documents a thumbnail/preview (closes today's gap) **without altering the stored original**.
- Keep "see your photo immediately" via the HEIC's embedded EXIF thumbnail.

**Non-goals**
- No change to non-HEIC uploads (jpeg/png/webp/avif keep today's exact path).
- No change to the upload byte-path architecture (still browser → storage direct, mint→PUT).
- No orphaned-blob garbage collection (out of scope; accepted at this scale, consistent with the document flow).
- No PostGIS / EXIF changes beyond extracting the embedded thumbnail.

## Decisions (resolved during brainstorming)

1. **Scope = all flows that involve HEIC**, with two output behaviors:
   - **Avatar + recommendation** → *replace*: the HEIC becomes the canonical JPEG.
   - **Documents** → *preview-only*: keep the original HEIC untouched; generate a derived thumbnail.
2. **EXIF stays client-side.** The existing `exifreader` call (GPS) **also** extracts the embedded JPEG thumbnail (`tags.Thumbnail`) for an instant low-res preview during the pending window. Fallback to a neutral placeholder when a HEIC has no embedded thumbnail (rare for iPhone).
3. **Transcode timing = post-submit, keyed on the `file` row** (worker runs after `create`/`update`/`confirm`, like the existing workers). Rejected: row-less, blob-keyed transcode-at-upload (more coupling + intermediate-blob lifecycle for marginal gain).
4. **Decode library = `heic-convert`** (Node, wraps `libheif-js` wasm — no canvas/DOM; the Node counterpart to the browser's `heic-to`). Decoded JPEG bytes feed `sharp` for any resizing (document thumbnail). `sharp` cannot be used to decode HEIC: the prebuilt binary omits libheif (this is why `SHARP_DECODABLE_MIME_SET` excludes HEIC). Fallback if `heic-convert` proves unsuitable: `libheif-js` directly.
5. **Permanent transcode failure** is tracked with a new nullable `file.transcodeFailedAt timestamptz`, so the UI shows a "couldn't process" placeholder (and the author can re-pick) instead of a perpetual spinner.
6. **Avatar pending on shared surfaces** falls back to initials/placeholder briefly (no app-wide EXIF-preview propagation).

## Architecture

### A. Client (upload side) — recommendation + avatar

- Remove the transcode step: drop `isHeicCandidate`/`transcodeHeicToJpeg` usage from `PhotoUploader.tsx` and `AvatarUpload.tsx`. Once unused, remove `src/lib/image/heic.ts` and the `heic-to` dependency. (`isHeicCandidate` may move server-side as a small MIME/extension helper if still needed for enqueue gating.)
- **Immediate preview from EXIF**: the client already calls `exifreader` for GPS; extend that call (or reuse its result) to pull `tags.Thumbnail` → `URL.createObjectURL(new Blob([thumb]))` → use as the tile/avatar `previewUrl`. No embedded thumbnail → neutral placeholder. This removes the "delay before the tile shows up" entirely (tile renders instantly, raw HEIC uploads in the background with the existing progress UI).
- **Upload raw HEIC**: the upload flow (`runUploadFlow` → mint → PUT) is unchanged except it sends the original HEIC file. The `PhotoUploader.addFiles` reordering so the tile is created *before* any async work also closes the no-feedback gap for non-HEIC (general UX win).

### B. Upload mint / server

- Add `image/heic` (+ `image/heif`) to the avatar+recommendation mint allow-list (`UPLOAD_IMAGE_MIME`) and `UPLOAD_IMAGE_EXT` (`heic`→`heic`). Pathname keeps the original extension. `MAX_PHOTO_BYTES` unchanged.
- Document upload already accepts arbitrary files; no allow-list change needed there.

### C. New queue topic + worker: `heic_transcode`

- `src/lib/effects/queue/queue.ts`: add `'heic_transcode'` to `QueueTopic` and payload `{ fileId: string; kind: 'avatar' | 'recommendation' | 'document'; userId?: string }` (`userId` carries the avatar denormalization target).
- New handler `src/lib/queue/handlers/heicTranscode.ts`, mirroring `blurhash.ts` / `imageThumbnail.ts`:
  1. Load the `file` row (`fileService.findActiveById`). Idempotence: skip if the row's `mime` is no longer HEIC (replace flows) or already has a thumbnail (document), or `transcodeFailedAt` is set.
  2. HEIC MIME gate (clean ack/no-retry on non-HEIC).
  3. Download bytes: `storage.getReadUrl(access, pathname, 60)` → `fetch` → `Buffer`.
  4. Decode HEIC → JPEG buffer via `heic-convert` (apply EXIF orientation).
  5. Branch on `kind`:
     - **Replace (avatar/recommendation)**: `storage.put(access, newJpegPathname, jpegBuf, 'image/jpeg')` (new `.jpg` pathname) → update the file row `pathname` + `mime` + `sizeBytes` (`fileService`) → `storage.delete` the old HEIC blob → enqueue `blurhash` (now decodable) → realtime publish (`recommendation.changed` for recommendation; for avatar, denormalize via the user image path the blurhash worker already uses).
     - **Preview (document)**: leave the file row untouched → `sharp(jpegBuf).rotate().resize(...).webp()` → `storage.put('public', thumbnailPathname(documentId), webp, 'image/webp')` → `documentService.setThumbnailPathname(...)` → `realtime.publish('document.changed', ...)`. (Identical tail to `image_thumbnail`.)
  6. On unrecoverable decode failure (corrupt bytes, exhausted retries): set `file.transcodeFailedAt = now`, ack (no retry), realtime publish so the UI can show the failure placeholder.
- Wire the topic in all five places (per the existing pattern): `queue.ts` union, the handler, `server/plugins/queueConsumer.ts` (Nitro dispatch), `scripts/devQueueWorker.ts` (BullMQ worker), and `vite.config.ts` `queues.triggers`.

### D. Enqueue trigger points

In each confirm/create path, branch on HEIC vs decodable:
- **Recommendation** `create`/`update` (`src/lib/orpc/procedures/recommendation.ts`): for each photo whose verified `mime` is HEIC → `queue.publish('heic_transcode', { fileId, kind: 'recommendation' })`; for decodable photos → `queue.publish('blurhash', …)` as today. (The transcode worker enqueues `blurhash` itself after replacing.)
- **Avatar** `confirmAvatarUpload` (`src/lib/orpc/procedures/image.ts`): HEIC → `heic_transcode` (kind `'avatar'`, `userId`); else `blurhash` as today.
- **Document** `confirmDocumentUpload` (`src/lib/orpc/procedures/document.ts`): HEIC → `heic_transcode` (kind `'document'`) for a preview; decodable → `blurhash` + `image_thumbnail` as today.

All `queue.publish` calls stay fire-and-forget with `.catch(log)`, matching the current pattern.

### E. Pending display & data flow

After submit, before the worker finishes, a replaced photo is still HEIC with no blurhash and no JPEG (a few seconds).
- **Recommendation read path** (`recommendation.list`/`get`): expose a per-photo **`pending` signal** (derived from `mime` still being HEIC and `transcodeFailedAt` null) and a **`failed`** signal (`transcodeFailedAt` set). The list/detail render: pending → neutral placeholder; failed → "couldn't process" placeholder; done → `coverUrl`/`url` + blurhash. The worker's `recommendation.changed` realtime event triggers a refetch, swapping placeholder → JPEG.
- **Editor (pre-submit)**: shows the EXIF embedded thumbnail throughout the session. After submit + navigation, the author sees the brief pending placeholder → JPEG.
- **Avatar**: during pending, shared surfaces (sidebar, owners list) fall back to initials/placeholder; the uploader keeps its local EXIF preview. Refetch after `user`/avatar realtime swaps to JPEG.

### F. Data model changes

- `file` table: add nullable `transcode_failed_at timestamptz` (Drizzle `timestamp({ withTimezone: true })`). Migration named descriptively (`pnpm db:generate --name=add_file_transcode_failed_at`). No other columns — "pending" is derived from `mime`, "done" from `mime` flipping to JPEG, "failed" from this column.
- No `recommendation`/`recommendation_photo` schema change; the read path computes `pending`/`failed` from the joined `file` row.

### G. Dependency changes

- **Add** `heic-convert` (server). **Remove** `heic-to` (client) and `src/lib/image/heic.ts` once no client imports remain.
- pnpm `allowBuilds`: set whatever build-script policy `heic-convert`/`libheif-js` need (likely `false` if prebuilt wasm ships), matching the `exifreader` precedent.

## Error handling

- **Transient** (network, cold wasm): queue retries — BullMQ `attempts: 3` locally; Vercel Queue retry in prod.
- **Permanent** (corrupt/undecodable HEIC after retries): set `transcodeFailedAt`, clean ack, realtime publish → UI shows "couldn't process" placeholder; recommendation author can remove/re-add the photo; avatar keeps initials and the user can re-upload.
- **Idempotence**: re-delivery after a successful replace is a no-op (mime already JPEG); after a document thumbnail, the existing `thumbnailPathname`-set check applies.

## Testing strategy (ADR-0002)

- **Worker handler** (`heicTranscode.test.ts`): commit a small real HEIC fixture; assert (a) replace path updates the file row to JPEG + deletes the source + enqueues blurhash, (b) document path emits a WebP thumbnail and leaves the original, (c) permanent-failure sets `transcodeFailedAt`, (d) idempotent re-delivery is a no-op. Each branch/error exercised.
- **Client**: `exifreader` thumbnail extraction → preview object URL; HEIC upload sends raw bytes (no transcode). Component test for the immediate-tile + pending/failed placeholder states.
- **Read path**: recommendation `list`/`get` expose correct `pending`/`failed` flags for HEIC vs JPEG file rows.

## Free-tier / cost

`libheif-js` wasm decode runs a few seconds of Function CPU per HEIC upload — occasional for ~20 users, well within Vercel Hobby. The decode that previously ran on the user's device now runs (async, non-blocking) on the worker; net client benefit is no freeze + ~3 MB less bundle.

## Affected files (inventory)

- Client: `src/components/recommendation/PhotoUploader.tsx`, `src/components/user/AvatarUpload.tsx`, `src/lib/files/exif.ts` (extend to return embedded thumbnail), remove `src/lib/image/heic.ts`.
- Mint: `src/lib/orpc/imageUpload.ts` (`UPLOAD_IMAGE_MIME`/`UPLOAD_IMAGE_EXT`).
- Queue: `src/lib/effects/queue/queue.ts`, new `src/lib/queue/handlers/heicTranscode.ts`, `server/plugins/queueConsumer.ts`, `scripts/devQueueWorker.ts`, `vite.config.ts`.
- Triggers: `src/lib/orpc/procedures/recommendation.ts`, `…/image.ts`, `…/document.ts`.
- Schema/migration: `src/lib/db/schema/file.ts` + a new migration.
- Read path: recommendation service + procedure (`pending`/`failed` exposure), recommendation list/detail components + avatar surfaces (placeholder states).
- Deps: `package.json` (add `heic-convert`, remove `heic-to`), `pnpm-workspace.yaml` `allowBuilds`.
- i18n: `messages/{sv,en}.json` ("couldn't process" / processing strings).

## Out of scope

- Orphaned-blob GC (abandoned uploads / removed photos / hard-deletes) — unchanged; accepted at this scale.
- Migrating the document store to transcode-on-store (documents keep originals by design).
- Safari's native HEIC rendering optimizations.
