# Server-side HEIC transcode worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move HEIC→JPEG transcode off the client into a backend queue worker so uploads never freeze the UI, while keeping an instant photo preview from the HEIC's embedded EXIF thumbnail.

**Architecture:** A new `heic_transcode` queue topic + handler (mirroring the existing `blurhash`/`image_thumbnail` workers) reads the uploaded HEIC from storage, decodes it with `heic-convert` (libheif wasm, Node), and either **replaces** the file with a JPEG (avatar, recommendation) or **derives** a WebP thumbnail keeping the original (documents). Clients upload raw HEIC and show the EXIF embedded thumbnail meanwhile; the worker publishes a realtime event so the UI swaps to the JPEG when done. Permanent decode failures are recorded on `file.transcode_failed_at` so the UI shows a "couldn't process" state instead of a perpetual spinner.

**Tech Stack:** TanStack Start + oRPC, Drizzle/Postgres (Neon), Vercel Queues (prod) / BullMQ (dev) / devLog (test), `heic-convert` + `sharp` (server), `exifreader` (client), Paraglide i18n, Vitest (node + browser projects), Biome.

**Source spec:** `docs/superpowers/specs/2026-06-29-server-side-heic-transcode-design.md`

## Global Constraints

Every task implicitly includes these (verbatim from CLAUDE.md / ADRs / the spec):

- **All `db` access through services** (`src/lib/services/<entity>/`). No `db.select()` in routes/handlers/workers. (ADR-0002)
- **Cross-system effects only in `src/lib/effects/`** (`storage`, `queue`, `realtime`); services never import them. Effects run *after* a successful service call; `queue.publish(...)` is fire-and-forget with `.catch(log)`. (ADR-0001)
- **Logging via `~/lib/logger`** — `logger.child({...})` in workers/server, `context.log` in procedures. Never `console.*`. (ADR-0003)
- **Realtime via `realtime.publish({ kind: '<ns>.changed', ids: [...] }, { source })`**; existing kinds include `recommendation.changed`, `document.changed`, `user.changed`. (ADR-0004)
- **All timestamp columns are `timestamp({ withTimezone: true })`**. New nullable columns need no `USING` clause. Name migrations: `pnpm db:generate --name=<descriptive_name>` then `pnpm db:migrate`. (CLAUDE.md)
- **User-facing strings are localized**: add to `messages/sv.json` (source of truth, informal "du") **and** `messages/en.json` (key-complete); call `m.<key>()`. Run `pnpm i18n:compile` after editing messages outside `pnpm dev`. Route URLs/code/logs stay English.
- **EXIF library is `exifreader`** (swapped from `exifr` on 2026-06-29). The only consumer is `src/lib/files/exif.ts`.
- **Public store only** for all HEIC in scope (avatars, recommendation photos are public; document HEIC originals keep their existing `access`).
- **Free tier first** — Vercel Hobby; libheif wasm decode is a few seconds of Function CPU per upload, occasional.
- **Conventional Commits** (`<type>(<scope>): <subject>` ≤72 chars); commit per task. **Do not push** unless asked.
- **Biome**: run `pnpm check` before committing each task.
- **Tests**: node tests via `pnpm test:node`, component tests via `pnpm test:components` (Vitest Browser Mode). DB tests call `setupDatabase()` first (per-test schema). (ADR-0002 testing rule: each branch/error path exercised.)

---

## Phase 1 — Schema + file service foundation

### Task 1: Add `transcode_failed_at` to `file` + service methods

**Files:**
- Modify: `src/lib/db/schema/file.ts`
- Create: migration under `drizzle/` (generated)
- Modify: `src/lib/services/file/file.ts`
- Test: `src/lib/services/file/file.test.ts`

**Interfaces:**
- Produces: `FileRow.transcodeFailedAt: Date | null`; `fileService.replaceTranscoded({ fileId, pathname, mime, sizeBytes }): Promise<void>`; `fileService.setTranscodeFailed(fileId): Promise<void>`.

- [ ] **Step 1: Add the column to the schema.** In `src/lib/db/schema/file.ts`, add after the `blurhash` line:

```ts
    blurhash: text('blurhash'),
    // Set when an async HEIC→JPEG transcode fails permanently (corrupt/undecodable
    // bytes, retries exhausted). null = pending or n/a; non-null = "couldn't process".
    transcodeFailedAt: timestamp('transcode_failed_at', { withTimezone: true }),
```

- [ ] **Step 2: Generate + apply the migration.**

Run: `pnpm db:generate --name=add_file_transcode_failed_at && pnpm db:migrate`
Expected: a new `drizzle/NNNN_add_file_transcode_failed_at.sql` with `ADD COLUMN "transcode_failed_at" timestamp with time zone`; migrate applies cleanly.

- [ ] **Step 3: Extend `FileRow` + `fileSelection`.** In `src/lib/services/file/file.ts`, add `transcodeFailedAt: Date | null` to the `FileRow` type and `transcodeFailedAt: file.transcodeFailedAt` to `fileSelection`.

- [ ] **Step 4: Write failing tests** for the two new methods. Append to `src/lib/services/file/file.test.ts`:

```ts
test('replaceTranscoded repoints pathname, mime, sizeBytes', async () => {
  await setupDatabase()
  const owner = await createTestUser()
  const [row] = await db
    .insert(file)
    .values({ ownerId: owner.id, pathname: 'p/x.heic', mime: 'image/heic', sizeBytes: 100, access: 'public' })
    .returning({ id: file.id })
  await fileService.replaceTranscoded({ fileId: row.id, pathname: 'p/x.jpg', mime: 'image/jpeg', sizeBytes: 80 })
  const after = await fileService.findById(row.id)
  expect(after).toMatchObject({ pathname: 'p/x.jpg', mime: 'image/jpeg', sizeBytes: 80 })
})

test('setTranscodeFailed stamps transcodeFailedAt', async () => {
  await setupDatabase()
  const owner = await createTestUser()
  const [row] = await db
    .insert(file)
    .values({ ownerId: owner.id, pathname: 'p/y.heic', mime: 'image/heic', sizeBytes: 100, access: 'public' })
    .returning({ id: file.id })
  await fileService.setTranscodeFailed(row.id)
  const after = await fileService.findById(row.id)
  expect(after?.transcodeFailedAt).toBeInstanceOf(Date)
})
```

(Match the existing test file's import style and `createTestUser`/`setupDatabase` helpers — copy the header of the current `file.test.ts`.)

- [ ] **Step 5: Run tests, verify they fail.** Run: `pnpm test:node -- file.test` → FAIL ("replaceTranscoded is not a function").

- [ ] **Step 6: Implement the methods.** Add to `src/lib/services/file/file.ts`:

```ts
/**
 * Repoint a file row at its transcoded JPEG: new pathname + mime + size, after a
 * background HEIC→JPEG transcode wrote the JPEG and the original was deleted.
 * Clears any prior transcode-failure flag.
 */
export async function replaceTranscoded(input: {
  fileId: string
  pathname: string
  mime: string
  sizeBytes: number
}): Promise<void> {
  await db
    .update(file)
    .set({
      pathname: input.pathname,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      transcodeFailedAt: null,
    })
    .where(and(eq(file.id, input.fileId), isNull(file.deletedAt)))
}

/** Mark a file's transcode as permanently failed (undecodable bytes / retries exhausted). */
export async function setTranscodeFailed(fileId: string): Promise<void> {
  await db
    .update(file)
    .set({ transcodeFailedAt: new Date() })
    .where(and(eq(file.id, fileId), isNull(file.deletedAt)))
}
```

- [ ] **Step 7: Run tests, verify pass.** Run: `pnpm test:node -- file.test` → PASS.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/db/schema/file.ts drizzle/ src/lib/services/file/
git commit -m "feat(file): add transcode_failed_at + replaceTranscoded/setTranscodeFailed"
```

---

## Phase 2 — Decode helper + queue topic + worker

### Task 2: Add `heic_transcode` topic + payload

**Files:** Modify `src/lib/effects/queue/queue.ts`

**Interfaces:**
- Produces: `QueueTopic` gains `'heic_transcode'`; `QueuePayloadMap['heic_transcode']` is a discriminated union over `kind`.

- [ ] **Step 1: Extend the union.** In `src/lib/effects/queue/queue.ts`:

```ts
export type QueueTopic =
  | 'blurhash'
  | 'image_thumbnail'
  | 'pdf_thumbnail'
  | 'email_user_invited'
  | 'heic_transcode'
```

- [ ] **Step 2: Add the payload.** Add to `QueuePayloadMap`:

```ts
  // HEIC→JPEG transcode. avatar/recommendation REPLACE the file with a JPEG;
  // document keeps the original and produces a WebP thumbnail. `userId` carries
  // the avatar's user so the worker can repoint user.image without a session.
  heic_transcode:
    | { fileId: string; kind: 'avatar'; userId: string }
    | { fileId: string; kind: 'recommendation' }
    | { fileId: string; kind: 'document'; documentId: string }
```

- [ ] **Step 3: Typecheck.** Run: `pnpm build` → the new union compiles (no consumers yet). Expected: build succeeds.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/effects/queue/queue.ts
git commit -m "feat(queue): add heic_transcode topic + payload"
```

### Task 3: Server HEIC decode helper (`heic-convert`)

**Files:**
- Create: `src/lib/image/heicTranscode.ts`
- Test: `src/lib/image/heicTranscode.test.ts`
- Create: `test/fixtures/geotagged.heic` (a small real iPhone-style HEIC; obtain from `~/Downloads/IMG_7817.HEIC` shrunk *without re-encoding away the HEIC container* — if no small fixture is available, commit the full file; it's a test asset)
- Modify: `package.json` (add `heic-convert`), `pnpm-workspace.yaml` (`allowBuilds`)

**Interfaces:**
- Produces: `transcodeHeicToJpeg(input: Buffer): Promise<Buffer>` — decodes HEIC bytes to a JPEG buffer. Throws on undecodable input.
- Consumes: nothing.

- [ ] **Step 1: Add the dependency.**

Run: `pnpm add heic-convert && pnpm add -D @types/heic-convert`
Then in `pnpm-workspace.yaml` under `allowBuilds:`, add the package(s) that pnpm flags as having build scripts, set to `false` if they ship prebuilt wasm (mirror the `exifreader: false` precedent). Run `pnpm install` and confirm exit 0.

- [ ] **Step 2: Write the failing test.** `src/lib/image/heicTranscode.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { transcodeHeicToJpeg } from './heicTranscode'

const fixture = fileURLToPath(new URL('../../../test/fixtures/geotagged.heic', import.meta.url))

test('decodes a HEIC buffer to a valid JPEG', async () => {
  const jpeg = await transcodeHeicToJpeg(readFileSync(fixture))
  const meta = await sharp(jpeg).metadata()
  expect(meta.format).toBe('jpeg')
  expect(meta.width).toBeGreaterThan(0)
})

test('throws on non-HEIC bytes', async () => {
  await expect(transcodeHeicToJpeg(Buffer.from('not an image'))).rejects.toThrow()
})
```

- [ ] **Step 3: Run, verify fail.** Run: `pnpm test:node -- heicTranscode` → FAIL ("Cannot find module './heicTranscode'").

- [ ] **Step 4: Implement.** `src/lib/image/heicTranscode.ts`:

```ts
// HEIC/HEIF → JPEG decode for the background transcode worker. `heic-convert`
// wraps libheif (wasm) and runs in Node without a browser/canvas — the server
// counterpart to the client's `heic-to`. sharp can't decode HEIC (the prebuilt
// libvips omits libheif), so it's only used downstream for resizing the decoded
// JPEG. Dynamic-imported so the wasm loads on first job, not at module load.
export async function transcodeHeicToJpeg(input: Buffer): Promise<Buffer> {
  const { default: convert } = await import('heic-convert')
  const out = await convert({ buffer: input, format: 'JPEG', quality: 0.85 })
  return Buffer.from(out)
}
```

- [ ] **Step 5: Run, verify pass.** Run: `pnpm test:node -- heicTranscode` → PASS (both cases).

- [ ] **Step 6: Commit.**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml src/lib/image/heicTranscode.ts src/lib/image/heicTranscode.test.ts test/fixtures/geotagged.heic
git commit -m "feat(image): add server-side heic-convert transcode helper"
```

### Task 4: The `heic_transcode` worker handler

**Files:**
- Create: `src/lib/queue/handlers/heicTranscode.ts`
- Test: `src/lib/queue/handlers/heicTranscode.test.ts`
- Modify: `src/lib/services/user/user.ts` (add `setImage`)

**Interfaces:**
- Consumes: `fileService.findActiveById`, `fileService.replaceTranscoded`, `fileService.setTranscodeFailed`; `documentService.setThumbnailPathname`; `userService.setImage(userId, url)`; `storage.{getReadUrl,put,head,delete}`; `transcodeHeicToJpeg`; `generateImageThumbnail`; `realtime.publish`; `queue.publish`.
- Produces: `handleHeicTranscodeMessage(msg: QueuePayloadMap['heic_transcode'], metadata: { messageId: string; deliveryCount: number }): Promise<void>`.

- [ ] **Step 1: Add `userService.setImage`.** In `src/lib/services/user/user.ts`, mirroring the existing `setImageBlurhash` (find it and copy its shape). It updates `user.image` directly (the worker has no session to call Better Auth's `updateUser`):

```ts
/** Repoint a user's avatar URL directly (worker context, no Better Auth session).
 * Returns false if the user is gone. Mirrors setImageBlurhash. */
export async function setImage(userId: string, image: string): Promise<boolean> {
  const res = await db.update(user).set({ image }).where(eq(user.id, userId)).returning({ id: user.id })
  return res.length > 0
}
```

(Use the same `user` table import + `db` the neighboring `setImageBlurhash` uses.)

- [ ] **Step 2: Write failing handler tests.** `src/lib/queue/handlers/heicTranscode.test.ts` — cover the three branches + failure. Use the same effect-mocking style the existing handler tests use (check `imageThumbnail.test.ts` / `blurhash.test.ts` for the `vi.mock('~/lib/effects', …)` pattern and copy it). Skeleton:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, expect, test, vi } from 'vitest'
// ... mock ~/lib/effects (storage/queue/realtime), services, and transcodeHeicToJpeg per the existing handler-test pattern ...

const META = { messageId: 'm1', deliveryCount: 1 }
const heic = readFileSync(fileURLToPath(new URL('../../../../test/fixtures/geotagged.heic', import.meta.url)))

test('recommendation: replaces file with JPEG, deletes original, enqueues blurhash, publishes', async () => {
  // arrange: findActiveById -> { mime: 'image/heic', pathname: 'recommendations/u/x.heic', access:'public', ... }
  // fetch -> heic bytes; transcodeHeicToJpeg -> jpeg buffer
  // act
  await handleHeicTranscodeMessage({ fileId: 'f1', kind: 'recommendation' }, META)
  // assert: storage.put('public', 'recommendations/u/x.jpg', jpeg, 'image/jpeg');
  //         fileService.replaceTranscoded({ fileId:'f1', pathname:'.../x.jpg', mime:'image/jpeg', sizeBytes: jpeg.length });
  //         storage.delete('public', 'recommendations/u/x.heic');
  //         queue.publish('blurhash', { fileId:'f1', kind:'recommendation' });
  //         realtime.publish({ kind:'recommendation.changed', ids:['f1-rec?'] }) — see note below
})

test('document: keeps original, writes WebP thumbnail, sets thumbnailPathname', async () => { /* kind:'document', documentId */ })
test('avatar: replaces file, repoints user.image to new url, enqueues blurhash', async () => { /* kind:'avatar', userId */ })
test('permanent decode failure: stamps transcodeFailedAt, no throw', async () => { /* transcodeHeicToJpeg rejects */ })
test('already JPEG (idempotent re-delivery): no-op', async () => { /* findActiveById mime image/jpeg */ })
```

> **Realtime id note for recommendation:** the worker has only `fileId`, but `recommendation.changed` is keyed by recommendation id. Resolve it: add `recommendationService.findRecommendationIdByFileId(fileId): Promise<string | null>` (a thin `select recommendation_id from recommendation_photo join … where file_id = $1`) and publish with that id; if null (photo removed mid-flight), skip the publish. Add this service method + a test in this task.

- [ ] **Step 3: Run, verify fail.** Run: `pnpm test:node -- heicTranscode.test` → FAIL ("handleHeicTranscodeMessage not exported").

- [ ] **Step 4: Implement the handler.** `src/lib/queue/handlers/heicTranscode.ts`:

```ts
import { queue, realtime, storage } from '~/lib/effects'
import type { QueuePayloadMap } from '~/lib/effects/queue/queue'
import { transcodeHeicToJpeg } from '~/lib/image/heicTranscode'
import { generateImageThumbnail } from '~/lib/image/thumbnail'
import { logger } from '~/lib/logger/server'
import * as documentService from '~/lib/services/document'
import * as fileService from '~/lib/services/file'
import * as recommendationService from '~/lib/services/recommendation'
import * as userService from '~/lib/services/user'

const READ_URL_TTL_SECONDS = 60
const HEIC_MIME = new Set(['image/heic', 'image/heif'])
const thumbnailPathname = (documentId: string) => `thumbnails/${documentId}.webp`
const toJpegPathname = (p: string) => p.replace(/\.(heic|heif)$/i, '.jpg')

export type HeicTranscodeJobMetadata = { messageId: string; deliveryCount: number }

/**
 * Shared handler for `heic_transcode` (Nitro plugin + dev BullMQ worker).
 * Decodes the uploaded HEIC and either replaces the file with a JPEG
 * (avatar/recommendation) or derives a WebP thumbnail (document). Transport
 * failures throw (queue retries); an undecodable file stamps
 * transcode_failed_at and acks so we stop retrying.
 */
export async function handleHeicTranscodeMessage(
  msg: QueuePayloadMap['heic_transcode'],
  metadata: HeicTranscodeJobMetadata,
): Promise<void> {
  const { fileId, kind } = msg
  const log = logger.child({ topic: 'heic_transcode', kind, fileId, ...metadata })

  const row = await fileService.findActiveById(fileId)
  if (!row) return log.warn('heic_transcode: file gone, skipping')
  if (!HEIC_MIME.has(row.mime)) return log.info('heic_transcode: already transcoded, skipping')
  if (row.transcodeFailedAt) return log.info('heic_transcode: previously failed, skipping')

  const url = await storage.getReadUrl(row.access, row.pathname, READ_URL_TTL_SECONDS)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`heic_transcode: download failed ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())

  let jpeg: Buffer
  try {
    jpeg = await transcodeHeicToJpeg(buf)
  } catch (error) {
    await fileService.setTranscodeFailed(fileId)
    log.warn('heic_transcode: decode failed, marked failed', { error })
    if (kind === 'recommendation') await publishRecommendation(fileId)
    if (kind === 'document') await realtime.publish({ kind: 'document.changed', ids: [msg.documentId] })
    if (kind === 'avatar') await realtime.publish({ kind: 'user.changed', ids: [msg.userId] })
    return
  }

  if (kind === 'document') {
    // Keep the original; produce a thumbnail like image_thumbnail does.
    let webp: Buffer
    try {
      webp = await generateImageThumbnail(jpeg)
    } catch (error) {
      await documentService.setThumbnailPathname({ documentId: msg.documentId, pathname: '' })
      return log.warn('heic_transcode: thumbnail render failed, sentinel written', { error })
    }
    const path = thumbnailPathname(msg.documentId)
    await storage.put('public', path, webp, 'image/webp')
    await documentService.setThumbnailPathname({ documentId: msg.documentId, pathname: path })
    await realtime.publish({ kind: 'document.changed', ids: [msg.documentId] })
    return log.info('heic_transcode: document thumbnail stored', { path })
  }

  // Replace (avatar | recommendation): write JPEG, repoint row, delete original.
  const jpegPath = toJpegPathname(row.pathname)
  await storage.put(row.access, jpegPath, jpeg, 'image/jpeg')
  await fileService.replaceTranscoded({ fileId, pathname: jpegPath, mime: 'image/jpeg', sizeBytes: jpeg.byteLength })
  await storage.delete(row.access, row.pathname).catch((error) =>
    log.warn('heic_transcode: failed to delete original HEIC', { error }),
  )
  await queue
    .publish('blurhash', kind === 'avatar' ? { fileId, kind: 'avatar', userId: msg.userId } : { fileId, kind: 'recommendation' })
    .catch((error) => log.warn('heic_transcode: blurhash enqueue failed', { error }))

  if (kind === 'avatar') {
    const blob = await storage.head(row.access, jpegPath)
    if (blob) await userService.setImage(msg.userId, blob.url)
    await realtime.publish({ kind: 'user.changed', ids: [msg.userId] })
  } else {
    await publishRecommendation(fileId)
  }
  log.info('heic_transcode: replaced with JPEG', { jpegPath })
}

async function publishRecommendation(fileId: string): Promise<void> {
  const id = await recommendationService.findRecommendationIdByFileId(fileId)
  if (id) await realtime.publish({ kind: 'recommendation.changed', ids: [id] })
}
```

Also add `findRecommendationIdByFileId` to the recommendation service (a `select recommendationPhoto.recommendationId … innerJoin … where file_id` returning the first id or null) + a small service test.

- [ ] **Step 5: Run, verify pass.** Run: `pnpm test:node -- heicTranscode` → PASS (all branches).

- [ ] **Step 6: `pnpm check`** then **commit.**

```bash
git add src/lib/queue/handlers/heicTranscode.ts src/lib/queue/handlers/heicTranscode.test.ts src/lib/services/user/ src/lib/services/recommendation/
git commit -m "feat(queue): add heic_transcode worker handler"
```

### Task 5: Wire the worker into both runtimes + Vite trigger

**Files:** Modify `server/plugins/queueConsumer.ts`, `scripts/devQueueWorker.ts`, `vite.config.ts`

- [ ] **Step 1: Nitro consumer.** In `server/plugins/queueConsumer.ts` import the handler and add a case:

```ts
import { handleHeicTranscodeMessage } from '~/lib/queue/handlers/heicTranscode'
// ...
      case 'heic_transcode':
        await handleHeicTranscodeMessage(message as QueuePayloadMap['heic_transcode'], meta)
        return
```

- [ ] **Step 2: Dev BullMQ worker.** In `scripts/devQueueWorker.ts` import the handler and add a 4th `Worker` to the `workers` array:

```ts
  new Worker<QueuePayloadMap['heic_transcode']>(
    'heic_transcode',
    async (job) => {
      await handleHeicTranscodeMessage(job.data, { messageId: job.id ?? 'local-unknown', deliveryCount: job.attemptsMade + 1 })
    },
    { connection: { url } },
  ),
```

- [ ] **Step 3: Vite/Nitro trigger.** In `vite.config.ts`, add to `queues.triggers` (after `{ topic: 'email_user_invited' }`): `{ topic: 'heic_transcode' },`.

- [ ] **Step 4: Update the CLAUDE.md `dev:worker` note** (the line listing consumed topics) to include `heic_transcode`.

- [ ] **Step 5: Build.** Run: `pnpm build` → succeeds.

- [ ] **Step 6: Commit.**

```bash
git add server/plugins/queueConsumer.ts scripts/devQueueWorker.ts vite.config.ts CLAUDE.md
git commit -m "feat(queue): wire heic_transcode consumer (nitro + bullmq + trigger)"
```

---

## Phase 3 — Allow HEIC upload + enqueue triggers

### Task 6: Allow HEIC in the avatar/recommendation mint allow-list

**Files:** Modify `src/lib/orpc/imageUpload.ts`

- [ ] **Step 1: Extend the constants.**

```ts
export const UPLOAD_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'] as const

export const UPLOAD_IMAGE_EXT: Record<(typeof UPLOAD_IMAGE_MIME)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
}
```

- [ ] **Step 2: Build/typecheck** (`mintAvatarUpload`/`mintImageUpload` `z.enum(UPLOAD_IMAGE_MIME)` widen automatically). Run: `pnpm build` → succeeds.

- [ ] **Step 3: Commit.** `git commit -am "feat(upload): accept image/heic in avatar+recommendation mint"`

### Task 7: Enqueue `heic_transcode` from recommendation create/update

**Files:** Modify `src/lib/orpc/procedures/recommendation.ts`

**Interfaces:** Consumes `queue.publish('heic_transcode', { fileId, kind: 'recommendation' })`. A shared `HEIC_MIME` set (define once near the top of the file or import from a small shared `~/lib/image/heicMime.ts`).

- [ ] **Step 1: In `create`**, replace the single blurhash-enqueue `Promise.all` (lines ~145–153) so HEIC photos enqueue transcode and decodable photos enqueue blurhash:

```ts
await Promise.all(
  result.photoFileIds.map((fileId, i) => {
    const mime = verified[i].mime
    if (HEIC_MIME.has(mime)) {
      return queue
        .publish('heic_transcode', { fileId, kind: 'recommendation' })
        .catch((e) => context.log.warn('heic_transcode enqueue failed', { error: e }))
    }
    if (SHARP_DECODABLE_MIME_SET.has(mime)) {
      return queue
        .publish('blurhash', { fileId, kind: 'recommendation' })
        .catch((e) => context.log.warn('blurhash enqueue failed', { error: e }))
    }
    return Promise.resolve()
  }),
)
```

- [ ] **Step 2: In `update`**, apply the same branching for the **new** photos (map `result.photoFileIds`/`verifiedNew` mimes — confirm the exact result shape in the file; mirror `create`).

- [ ] **Step 3: Define `HEIC_MIME`** (`new Set(['image/heic','image/heif'])`) imported from a shared module also used by the worker (avoid duplicating the literal).

- [ ] **Step 4: Build + node tests** for the procedure if present. Run: `pnpm build && pnpm test:node -- recommendation` → succeeds.

- [ ] **Step 5: Commit.** `git commit -am "feat(recommendation): enqueue heic_transcode for HEIC photos"`

### Task 8: Enqueue `heic_transcode` from avatar confirm

**Files:** Modify `src/lib/orpc/procedures/image.ts`

- [ ] **Step 1: Branch the enqueue + the user.image set.** In `confirmAvatarUpload`, after `replaceAvatarForUser` + the previous-blob cleanup, replace the unconditional blurhash enqueue + `auth.api.updateUser` with:

```ts
const isHeic = blob.contentType === 'image/heic' || blob.contentType === 'image/heif'
if (isHeic) {
  // Defer the avatar pointer + blurhash to the transcode worker (it sets
  // user.image to the JPEG url and enqueues blurhash). Until then the avatar
  // falls back to initials on shared surfaces; the uploader shows its local
  // EXIF preview. (spec §E)
  await queue
    .publish('heic_transcode', { fileId: newRow.id, kind: 'avatar', userId: context.user.id })
    .catch((error) => context.log.warn('failed to enqueue avatar heic_transcode', { fileId: newRow.id, error }))
} else {
  await queue
    .publish('blurhash', { fileId: newRow.id, kind: 'avatar', userId: context.user.id })
    .catch((error) => context.log.warn('failed to enqueue avatar blurhash', { fileId: newRow.id, error }))
  await auth.api.updateUser({ body: { image: blob.url }, headers: context.headers })
}
```

- [ ] **Step 2: Return shape.** Return `{ imageUrl: isHeic ? null : blob.url, pending: isHeic }` so `AvatarUpload` knows to keep its local EXIF preview (Task 13). Adjust the return type + the client call site accordingly.

- [ ] **Step 3: Keep the `user.changed` realtime publish** (the worker also publishes it after transcode).

- [ ] **Step 4: Build.** Run: `pnpm build` → succeeds.

- [ ] **Step 5: Commit.** `git commit -am "feat(avatar): transcode HEIC avatars via worker"`

### Task 9: Enqueue `heic_transcode` (document preview) from document confirm

**Files:** Modify `src/lib/orpc/procedures/document.ts`

- [ ] **Step 1: Branch the post-confirm enqueue.** Where `confirmDocumentUpload` enqueues `blurhash` + `image_thumbnail` (gated on `SHARP_DECODABLE_MIME_SET`), add a HEIC branch that enqueues a document-kind transcode for the preview (the original file is untouched):

```ts
if (HEIC_MIME.has(inserted.file.mime)) {
  await queue
    .publish('heic_transcode', { fileId: inserted.file.id, kind: 'document', documentId: inserted.document.id })
    .catch((error) => context.log.warn('heic_transcode enqueue failed', { error }))
} else if (SHARP_DECODABLE_MIME_SET.has(inserted.file.mime)) {
  // existing blurhash + image_thumbnail enqueues, unchanged
}
```

(Confirm the exact `inserted` shape against the current file; `HEIC_MIME` from the shared module.)

- [ ] **Step 2: Build + tests.** Run: `pnpm build && pnpm test:node -- document` → succeeds.

- [ ] **Step 3: Commit.** `git commit -am "feat(document): generate thumbnail for HEIC documents via worker"`

---

## Phase 4 — Recommendation read path: pending / failed

### Task 10: Expose `pending`/`failed` on recommendation photos

**Files:**
- Modify: `src/lib/services/recommendation/recommendation.ts` (read selection)
- Modify: `src/lib/orpc/procedures/recommendation.ts` (`list`/`get` mapping)
- Test: `src/lib/services/recommendation/recommendation.test.ts`

**Interfaces:**
- Produces: each photo in `list`/`get` gains `pending: boolean` (mime is HEIC and not failed) and `failed: boolean` (`transcodeFailedAt` set). `list` cover: `coverUrl` is `null` when the cover photo is pending/failed.

- [ ] **Step 1: Add `mime` + `transcodeFailedAt` to the photo read selection.** In the recommendation service's photo query (the `db.select({...}).from(recommendationPhoto).innerJoin(file, …)`), add `mime: file.mime` and `transcodeFailedAt: file.transcodeFailedAt`. Update the returned photo type.

- [ ] **Step 2: Write failing test.** In `recommendation.test.ts`, create a recommendation whose photo file has `mime: 'image/heic'`, assert the service item's photo carries `mime: 'image/heic'` and `transcodeFailedAt: null`.

- [ ] **Step 3: Run → fail; implement the selection; run → pass.** `pnpm test:node -- recommendation`

- [ ] **Step 4: Map to `pending`/`failed` in the procedure.** In `list`:

```ts
return Promise.all(
  items.map(async (item) => {
    const cover = item.photos[0]
    const coverPending = !!cover && (HEIC_MIME.has(cover.mime) || !!cover.transcodeFailedAt)
    return {
      ...item,
      photos: item.photos.map((p) => ({ ...p, pending: HEIC_MIME.has(p.mime) && !p.transcodeFailedAt, failed: !!p.transcodeFailedAt })),
      coverUrl: cover && !coverPending ? await publicPhotoUrl(cover.pathname) : null,
    }
  }),
)
```

In `get`, map each photo: `url` only when not pending/failed; add `pending`/`failed` flags:

```ts
const photos = await Promise.all(
  item.photos.map(async (p) => ({
    ...p,
    pending: HEIC_MIME.has(p.mime) && !p.transcodeFailedAt,
    failed: !!p.transcodeFailedAt,
    url: HEIC_MIME.has(p.mime) || p.transcodeFailedAt ? null : await publicPhotoUrl(p.pathname),
  })),
)
```

- [ ] **Step 5: Build + tests.** `pnpm build && pnpm test:node -- recommendation` → PASS.

- [ ] **Step 6: Commit.** `git commit -am "feat(recommendation): expose photo pending/failed transcode state"`

---

## Phase 5 — Client: EXIF preview, raw upload, placeholders, cleanup

### Task 11: Extend `exif.ts` to return the embedded thumbnail

**Files:** Modify `src/lib/files/exif.ts`; Test: `src/lib/files/exif.test.ts` (new, node)

**Interfaces:**
- Produces: `readImageMetaFromFile(file: File): Promise<{ gps: { lat: number; lng: number } | null; thumbnailUrl: string | null }>` — single `exifreader` pass returning both GPS and an object URL for the embedded JPEG thumbnail (or null). Keep the existing `readGpsFromFile` as a thin wrapper (`(await readImageMetaFromFile(file)).gps`) so current callers are unaffected, OR update callers in Tasks 12–13.

- [ ] **Step 1: Write failing test** (node): load the committed HEIC fixture as a `File` (via `new File([buf], 'x.heic', { type:'image/heic' })`), assert `gps` matches `38.6286/20.5989` and `thumbnailUrl` is a non-null string. (Note: `URL.createObjectURL` needs the browser project, OR return the thumbnail as a `Blob` and let callers create the URL — prefer returning `{ thumbnail: Blob | null }` to keep this node-testable, and create the object URL in the component.)

Decision: return `{ gps, thumbnail: Blob | null }`; components call `URL.createObjectURL`.

- [ ] **Step 2: Run → fail.** `pnpm test:node -- exif`

- [ ] **Step 3: Implement** using `exifreader`'s `{ expanded: true }` result — `tags.Thumbnail?.image` is an `ArrayBuffer` of the embedded JPEG:

```ts
import ExifReader from 'exifreader'

export async function readImageMetaFromFile(
  file: File,
): Promise<{ gps: { lat: number; lng: number } | null; thumbnail: Blob | null }> {
  try {
    const tags = ExifReader.load(await file.arrayBuffer(), { expanded: true })
    const lat = tags.gps?.Latitude
    const lng = tags.gps?.Longitude
    const gps =
      typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
        ? { lat, lng }
        : null
    const thumbBuf = tags.Thumbnail?.image
    const thumbnail = thumbBuf ? new Blob([thumbBuf], { type: 'image/jpeg' }) : null
    return { gps, thumbnail }
  } catch {
    return { gps: null, thumbnail: null }
  }
}

export async function readGpsFromFile(file: File) {
  return (await readImageMetaFromFile(file)).gps
}
```

- [ ] **Step 4: Run → pass.** `pnpm test:node -- exif`

- [ ] **Step 5: Commit.** `git commit -am "feat(exif): extract embedded thumbnail alongside GPS"`

### Task 12: `PhotoUploader` — upload raw HEIC, EXIF preview, instant tile

**Files:** Modify `src/components/recommendation/PhotoUploader.tsx`, `src/components/recommendation/recommendationFormTypes.ts`; Test: `*.browser.test.tsx`

- [ ] **Step 1: Add a `'processing'`/preview concept to `FormPhoto`** if needed — at minimum the tile must render before transcode existed previously; now there's no client transcode, so create the slot from the raw file immediately. The `previewUrl` for a HEIC comes from the EXIF thumbnail Blob (object URL); fallback placeholder when null.

- [ ] **Step 2: Rework `addFiles`** so the slot+preview are created **before** any await (kills the no-feedback gap), remove `isHeicCandidate`/`transcodeHeicToJpeg`, and upload the **raw** file:

```ts
// EXIF (GPS + thumbnail) on the original, before upload.
const { gps, thumbnail } = await readImageMetaFromFile(raw)
if (!exifReported && gps && onExifLocation) { onExifLocation(gps); exifReported = true }
const isHeic = raw.type === 'image/heic' || raw.type === 'image/heif' || /\.hei[cf]$/i.test(raw.name)
const previewUrl = isHeic
  ? (thumbnail ? URL.createObjectURL(thumbnail) : '') // '' → placeholder tile
  : URL.createObjectURL(raw)
// size/mime validation on `raw` (HEIC now allowed); contentType = raw.type
// create slot {status:'uploading', previewUrl}, onChange, then runUploadFlow(raw, …)
```

Remove the HEIC transcode branch entirely. Mint `contentType` is now `raw.type` (HEIC allowed by Task 6). `PhotoTile` renders the placeholder when `previewUrl === ''`.

- [ ] **Step 3: Browser test** (`PhotoUploader.browser.test.tsx`): seed `orpc.tag.list`; simulate adding a (non-HEIC) file and assert a tile renders immediately with the preview and upload progress. (HEIC EXIF-thumbnail path verified live — see verification section.)

- [ ] **Step 4: `pnpm check` + `pnpm test:components` (the new test).** Commit.

```bash
git commit -am "feat(recommendation): upload raw HEIC, preview via EXIF thumbnail"
```

### Task 13: `AvatarUpload` — same removal + EXIF preview + pending handling

**Files:** Modify `src/components/user/AvatarUpload.tsx`

- [ ] **Step 1: Remove** `isHeicCandidate`/`transcodeHeicToJpeg`; read `{ gps unused, thumbnail }`; upload the raw file; for HEIC show the EXIF-thumbnail object URL locally; for the `confirmAvatarUpload` response `{ imageUrl: null, pending: true }` keep showing the local preview (the worker will set the real avatar; `user.changed` realtime refetches).

- [ ] **Step 2: Build.** `pnpm build`. Commit. `git commit -am "feat(avatar): upload raw HEIC with EXIF preview"`

### Task 14: Pending/failed placeholders in recommendation list/detail

**Files:** Modify the recommendation list/detail components that render `coverUrl`/photo `url` (e.g. `RecommendationMap` orbs, the list cards, `RecommendationDetailDialog`).

- [ ] **Step 1: Render states.** Where a photo/cover is shown: `failed` → a muted "couldn't process" placeholder (icon + `m.recommendation_photo_processing_failed()`); `pending` (no url yet) → the blurhash/neutral placeholder + `m.recommendation_photo_processing()`; otherwise the image. The existing `recommendation.changed` realtime + query invalidation already refetch when the worker finishes (no new wiring).

- [ ] **Step 2: Add i18n keys** to `messages/{sv,en}.json`: `recommendation_photo_processing` ("Bearbetar bild…" / "Processing photo…"), `recommendation_photo_processing_failed` ("Kunde inte bearbeta bilden" / "Couldn't process this photo"). Run `pnpm i18n:compile`.

- [ ] **Step 3: Browser test** for the detail/list placeholder states (seed a photo with `pending:true` and `failed:true`). Commit.

```bash
git commit -am "feat(recommendation): pending/couldn't-process photo placeholders"
```

### Task 15: Drop `heic-to` + remove the client transcode helper

**Files:** Delete `src/lib/image/heic.ts`; Modify `package.json`, `pnpm-workspace.yaml`.

- [ ] **Step 1: Confirm no importers remain.** Run: `grep -rn "image/heic'\|transcodeHeicToJpeg\|heic-to" src/` → only the new server `heicTranscode.ts` / `heicMime.ts` (which do NOT import `heic-to`). If `isHeicCandidate` is still wanted, it now lives in the shared `heicMime.ts` (define a tiny `isHeicFile(file)` there); update the two client call sites to use it. Then delete `src/lib/image/heic.ts`.

- [ ] **Step 2: Remove the dependency.** Run: `pnpm remove heic-to`; remove its `allowBuilds` entry from `pnpm-workspace.yaml` if present; `pnpm install` (exit 0).

- [ ] **Step 3: Full build + suite.** Run: `pnpm build && pnpm test` → all green; confirm the client bundle no longer contains the ~3 MB `heic-to` wasm (the build's chunk list no longer lists `heic-to`).

- [ ] **Step 4: Commit.**

```bash
git commit -am "chore(image): drop client-side heic-to (transcode now server-side)"
```

---

## Self-review (completed by plan author)

- **Spec coverage:** client raw-upload + EXIF preview (T11–13), mint allow-list (T6), worker topic/handler/decode (T2–4), 5-place wiring (T5), enqueue triggers for all 3 flows (T7–9), replace vs document-preview behavior (T4), pending/failed read-path + UI (T10, T14), `transcode_failed_at` failure signal (T1, T4, T10, T14), avatar `user.image` repoint without a session (T4/T8), drop `heic-to` (T15), free-tier note (constraints), tests per branch (T1,3,4,10). ✅
- **Open verification items flagged inline** (not placeholders — they're "confirm exact shape against current file" notes): the `update` result photo shape (T7 Step 2), the `inserted` shape in `confirmDocumentUpload` (T9), and the existing handler-test mocking pattern to copy (T4 Step 2). These are confirmations against real code, with the surrounding code shown.
- **Type consistency:** `handleHeicTranscodeMessage(msg, metadata)`, `QueuePayloadMap['heic_transcode']` discriminated union, `fileService.replaceTranscoded/{setTranscodeFailed}`, `userService.setImage`, `recommendationService.findRecommendationIdByFileId`, `readImageMetaFromFile → { gps, thumbnail }` — names used consistently across tasks. ✅

## End-to-end verification (after all tasks)

1. `pnpm dev:up` (db+queue+storage+migrate) + `pnpm dev` + `pnpm dev:worker`.
2. Recommendation editor: add the real `~/Downloads/IMG_7817.HEIC` → tile appears instantly with the EXIF thumbnail, no freeze; map pin auto-places; submit → on the list, the cover shows the pending placeholder for a few seconds, then swaps to the JPEG (worker log: `heic_transcode: replaced with JPEG`).
3. Avatar: upload a HEIC → local preview immediate; after the worker runs, the avatar shows the JPEG app-wide (refresh / realtime).
4. Document: upload a HEIC document → original downloads as HEIC; a thumbnail appears once the worker runs.
5. Failure path: feed a deliberately corrupt `.heic` → `transcode_failed_at` set; UI shows "couldn't process".
6. `pnpm build` chunk list no longer includes `heic-to`.
