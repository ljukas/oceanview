# Cross-Process Realtime via Redis Pub/Sub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `realtime.publish(...)` from background-job handlers reach SSE-connected browsers in both dev and prod, by adding a Redis pub/sub adapter behind the existing `RealtimeEffects` interface — removing the per-feature polling workaround.

**Architecture:** The realtime effect (`src/lib/effects/realtime/`) already exposes a two-function interface (`publish` / `subscribe`) with one adapter today (`inMemory`, an in-process `MemoryPublisher`). Job handlers run in a *separate process* in both dev (`scripts/devQueueWorker.ts`) and prod (a distinct Vercel Queue function), so their publishes never reach the web process holding the SSE subscribers — hence the current `refetchInterval` polling. We add a second adapter (`redis`) using oRPC's `IORedisPublisher`, selected by env, so any process's publish fans out to every browser. This is the revisit trigger ADR-0004 explicitly anticipated; call sites and the event schema are unchanged.

**Tech Stack:** TanStack Start (RC, locked) on Vite · oRPC `@orpc/experimental-publisher` (already installed, ^1.14.5) · `ioredis` (new direct dep; already transitive via `bullmq`) · Redis pub/sub — dev: existing `compose.yaml` `queue` container; prod: Upstash Redis (Vercel Marketplace, free tier) · Vitest (node project) · Biome.

## Global Constraints

- **Effects pattern (ADR-0001):** broker SDKs (`ioredis`, `@orpc/experimental-publisher/ioredis`) are imported **only** inside `src/lib/effects/realtime/adapters/`; never in procedures, handlers, or services. Adapter selection mirrors `src/lib/effects/queue/queue.ts` (lazy + dynamic import via `src/lib/effects/lazy.ts`).
- **`REDIS_URL` MUST stay UNSET in Vercel production.** `queue.ts` selects `bullmqQueue` whenever `REDIS_URL` is set (before the `VERCEL` check), and BullMQ has no prod consumer. The realtime transport therefore uses its **own** var, `REALTIME_REDIS_URL`, falling back to `REDIS_URL` only in dev.
- **Logging (ADR-0003):** never `console.*`; use `~/lib/logger`. (No new logging needed here, but applies if added.)
- **The `RealtimeEffects` interface, `RealtimeEnvelope`, `shouldDeliver`, the event schema (`types.ts`), the SSE procedure, `useRealtimeSync`, and every `realtime.publish` call site stay UNCHANGED.** Only a new adapter + the selection facade + docs + a polling relaxation.
- **Tests:** `pnpm test:node` runs the node project under `VITEST=true`, which must always select the in-process adapter (no Redis in CI).
- **Conventional Commits**, one concern per PR (this is the realtime-transport PR). Run `pnpm check` (Biome) before each commit.
- **Before editing any `.tsx` under `src/components/`**, load `vercel:react-best-practices` (project rule: "Load React skill before TSX work").
- **Free tier first (~20 users):** Upstash free tier (per-command billing, idle SUBSCRIBE free, single-digit concurrent connections) covers this.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/effects/realtime/adapters/redis.ts` *(create)* | `createRedisRealtime(url)` — Redis pub/sub adapter over `IORedisPublisher`, same shape as `inMemory.ts`. |
| `src/lib/effects/realtime/adapters/redis.test.ts` *(create)* | Gated integration test (skipped without a reachable Redis). |
| `src/lib/effects/realtime/realtime.ts` *(modify)* | Replace `export const realtime = inMemory` with a lazy env-selected facade; add pure `selectRealtimeAdapterKind`. |
| `src/lib/effects/realtime/realtime.test.ts` *(modify)* | Add unit tests for `selectRealtimeAdapterKind` (CI-green, no Redis). |
| `package.json` *(modify)* | Add `ioredis` as a direct dependency. |
| `.env.example` *(modify)* | Document `REALTIME_REDIS_URL` + the prod `REDIS_URL` warning. |
| `src/lib/queue/handlers/heicTranscode.ts` *(modify)* | Update the `publishRecommendation` NOTE comment (event now reaches browsers). |
| `src/routes/_authenticated/recommendations.index.tsx` *(modify)* | Relax poll 3s → 15s safety-net; update comment. |
| `src/components/recommendation/RecommendationDetailDialog.tsx` *(modify)* | Relax poll 3s → 15s safety-net; update comment. |
| `docs/adr/0004-realtime-sync-architecture.md` *(modify)* | Amendment: Redis adapter implemented. |
| `docs/adr/0007-background-job-queue-architecture.md` · `docs/adr/0011-presence-online-status-architecture.md` *(modify)* | One-line cross-reference notes. |
| `CLAUDE.md` *(modify)* | Decision line + env-var entry + `dev:worker` note. |
| `~/.claude/.../memory/reference-realtime-publish-in-process-only.md` + `MEMORY.md` *(modify)* | Supersede the "poll-while-pending instead" guidance. |

---

## Task 1: Redis realtime adapter

**Files:**
- Create: `src/lib/effects/realtime/adapters/redis.ts`
- Test: `src/lib/effects/realtime/adapters/redis.test.ts`
- Modify: `package.json` (add `ioredis`)

**Interfaces:**
- Consumes: `RealtimeEffects`, `RealtimeEnvelope` from `../realtime` (existing); `IORedisPublisher` from `@orpc/experimental-publisher/ioredis`; `Redis` from `ioredis`.
- Produces: `export function createRedisRealtime(url: string): RealtimeEffects` — used by Task 2.

> **API check first.** `@orpc/experimental-publisher` is experimental. Before implementing, confirm the installed (^1.14.5) shape: `IORedisPublisher` constructed with `{ commander, listener, prefix? }` and exposing `.publish(channel, payload)` + `.subscribe(channel, { signal }): AsyncIterable<payload>` — the same `Publisher` interface `MemoryPublisher` implements in `inMemory.ts`. Inspect `node_modules/@orpc/experimental-publisher/dist/adapters/ioredis/*.d.ts` and adjust the calls below if the names differ. (Verified against current oRPC docs 2026-06-30.)

- [ ] **Step 1: Start a local Redis** (the integration test needs it)

```bash
pnpm queue:up   # or: pnpm dev:up
```

- [ ] **Step 2: Write the failing integration test**

Create `src/lib/effects/realtime/adapters/redis.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import type { Logger } from '~/lib/logger'
import { createRedisRealtime } from './redis'

const url = process.env.REALTIME_REDIS_URL ?? process.env.REDIS_URL

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
}

// Integration test — needs a real Redis. Run `pnpm queue:up` first, then:
//   REDIS_URL=redis://localhost:14521 pnpm test:node redis.test
// Skipped in CI and in the default `pnpm test` run (no Redis container).
describe.skipIf(!url)('redis realtime adapter (integration)', () => {
  test('a publish from one connection reaches a subscriber on another', async () => {
    const publisher = createRedisRealtime(url as string)
    const subscriber = createRedisRealtime(url as string)
    const ctrl = new AbortController()

    const received: unknown[] = []
    const done = (async () => {
      for await (const env of subscriber.subscribe({ signal: ctrl.signal, log: noopLogger })) {
        received.push(env)
        break
      }
    })()

    // Wait for SUBSCRIBE to register — Redis pub/sub is not buffered.
    await new Promise((r) => setTimeout(r, 250))
    await publisher.publish(
      { kind: 'recommendation.changed', ids: ['rec_1'] },
      { source: 'user_1' },
    )

    await Promise.race([
      done,
      new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000)),
    ])
    ctrl.abort()

    expect(received[0]).toEqual({
      event: { kind: 'recommendation.changed', ids: ['rec_1'] },
      source: 'user_1',
    })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `REDIS_URL=redis://localhost:14521 pnpm test:node redis.test`
Expected: FAIL — cannot resolve `./redis` (module not found).

- [ ] **Step 4: Add the `ioredis` dependency**

```bash
pnpm add ioredis
```

(It is already present transitively via `bullmq`, but pnpm's strict layout requires a direct dep to import it directly. Do not add `@orpc/experimental-publisher` — already a dependency.)

- [ ] **Step 5: Implement the adapter**

Create `src/lib/effects/realtime/adapters/redis.ts`:

```ts
import { IORedisPublisher } from '@orpc/experimental-publisher/ioredis'
import { Redis } from 'ioredis'
import type { RealtimeEffects, RealtimeEnvelope } from '../realtime'

const CHANNEL = 'event' as const

// Cross-process realtime transport (ADR-0004 amendment). Mirrors inMemory.ts but
// over Redis pub/sub, so a publish from ANY process — the dev BullMQ worker or a
// prod Vercel Queue function — reaches the SSE subscribers on the web process.
// The `source` field rides the JSON envelope unchanged, so the SSE handler's
// shouldDeliver() echo-suppression keeps working across instances.
//
// IORedisPublisher needs two connections: `commander` (PUBLISH) and `listener`
// (SUBSCRIBE) — ioredis cannot issue commands on a connection in subscribe mode.
// maxRetriesPerRequest: null matches BullMQ's requirement and avoids command
// errors during reconnect; ioredis enables TLS automatically for rediss:// URLs.
export function createRedisRealtime(url: string): RealtimeEffects {
  const publisher = new IORedisPublisher<{ [CHANNEL]: RealtimeEnvelope }>({
    commander: new Redis(url, { maxRetriesPerRequest: null }),
    listener: new Redis(url, { maxRetriesPerRequest: null }),
    prefix: 'oceanview:realtime:',
  })
  return {
    async publish(event, opts) {
      await publisher.publish(CHANNEL, { event, source: opts?.source })
    },
    subscribe({ signal }) {
      return publisher.subscribe(CHANNEL, { signal })
    },
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `REDIS_URL=redis://localhost:14521 pnpm test:node redis.test`
Expected: PASS (1 test). If the run hangs on exit, the ioredis clients are still connected — harmless under Vitest's forked worker pool, which is killed on completion.

- [ ] **Step 7: Confirm the default test run still skips it**

Run: `pnpm test:node redis.test`
Expected: the suite is SKIPPED (no `REDIS_URL` in the default env), 0 failures.

- [ ] **Step 8: Format and commit**

```bash
pnpm check
git add src/lib/effects/realtime/adapters/redis.ts src/lib/effects/realtime/adapters/redis.test.ts package.json pnpm-lock.yaml
git commit -m "feat(realtime): add Redis pub/sub adapter behind RealtimeEffects"
```

---

## Task 2: Env-selected adapter facade

**Files:**
- Modify: `src/lib/effects/realtime/realtime.ts`
- Modify: `src/lib/effects/realtime/realtime.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `createRedisRealtime(url)` from Task 1; `inMemory` from `./adapters/inMemory`; `lazy` from `../lazy`.
- Produces: `export function selectRealtimeAdapterKind(env): 'inMemory' | 'redis'` (pure); the `realtime` singleton unchanged in type.

- [ ] **Step 1: Write the failing unit tests for the selector**

Add to `src/lib/effects/realtime/realtime.test.ts` — extend the import on line 4 and append a new describe block:

```ts
// line 4 becomes:
import { type RealtimeEnvelope, selectRealtimeAdapterKind, shouldDeliver } from './realtime'
```

```ts
describe('selectRealtimeAdapterKind', () => {
  test('tests always use the in-process adapter', () => {
    expect(
      selectRealtimeAdapterKind({ VITEST: 'true', REALTIME_REDIS_URL: 'rediss://x' }),
    ).toBe('inMemory')
  })

  test('dev falls back to REDIS_URL when REALTIME_REDIS_URL is unset', () => {
    expect(selectRealtimeAdapterKind({ REDIS_URL: 'redis://localhost:14521' })).toBe('redis')
  })

  test('prod selects redis from its own REALTIME_REDIS_URL', () => {
    expect(selectRealtimeAdapterKind({ REALTIME_REDIS_URL: 'rediss://upstash' })).toBe('redis')
  })

  test('no redis configured → in-process', () => {
    expect(selectRealtimeAdapterKind({})).toBe('inMemory')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:node realtime.test`
Expected: FAIL — `selectRealtimeAdapterKind` is not exported.

- [ ] **Step 3: Implement the facade**

Replace the bottom of `src/lib/effects/realtime/realtime.ts` (the import block stays; swap the trailing `export const realtime = inMemory` block). Final file:

```ts
import type { Logger } from '~/lib/logger'
import { lazy } from '../lazy'
import type { RealtimeEvent } from './types'

// A delivered event plus the id of the actor that caused it. `source` is
// server-internal transport metadata (never serialized to the browser — that's
// why it rides an envelope and not `realtimeEventSchema`). The SSE handler uses
// it for echo suppression: an event is not delivered back to its own actor's
// subscription (the actor's tab already updated itself locally). `source` is
// `undefined` for broadcast-to-all publishes (presence, background jobs).
export type RealtimeEnvelope = { event: RealtimeEvent; source?: string }

export interface RealtimeEffects {
  publish(event: RealtimeEvent, opts?: { source?: string }): Promise<void>
  subscribe(args: { signal?: AbortSignal; log: Logger }): AsyncIterable<RealtimeEnvelope>
}

// Echo-suppression policy applied by the SSE handler: a subscriber should not
// receive an event it caused itself (the actor's own tab already updated
// locally via its mutation's invalidation — see ADR-0004). Sourceless events
// (presence transitions, background jobs) are broadcast to everyone, including
// the actor, and are always delivered.
export function shouldDeliver(source: string | undefined, self: string): boolean {
  return source === undefined || source !== self
}

// Adapter selection (pure — no I/O, so it's unit-testable). Realtime needs a
// cross-process transport so background-job handlers (a separate process in dev
// AND prod) can reach SSE subscribers. We reuse Redis pub/sub, but on its OWN
// env var: `REDIS_URL` is read by the QUEUE selector (queue.ts) to pick BullMQ,
// which has no prod consumer — so setting REDIS_URL in prod would break jobs.
// In dev we fall back to REDIS_URL for convenience (the local container serves
// both queue and realtime). Tests and no-Redis dev use the in-process adapter.
export function selectRealtimeAdapterKind(env: {
  VITEST?: string
  REALTIME_REDIS_URL?: string
  REDIS_URL?: string
}): 'inMemory' | 'redis' {
  if (env.VITEST === 'true') return 'inMemory'
  return env.REALTIME_REDIS_URL || env.REDIS_URL ? 'redis' : 'inMemory'
}

// Lazy + dynamic import (mirrors effects/queue/queue.ts): the heavy adapter
// (ioredis) stays code-split and never loads in tests; selection runs once.
const getAdapter = lazy(async (): Promise<RealtimeEffects> => {
  if (selectRealtimeAdapterKind(process.env) === 'inMemory') {
    return (await import('./adapters/inMemory')).inMemory
  }
  const url = (process.env.REALTIME_REDIS_URL ?? process.env.REDIS_URL) as string
  return (await import('./adapters/redis')).createRedisRealtime(url)
})

export const realtime: RealtimeEffects = {
  async publish(event, opts) {
    await (await getAdapter()).publish(event, opts)
  },
  subscribe(args) {
    // Async-generator wrapper: adapter selection is a dynamic import, but
    // `subscribe` must return an AsyncIterable synchronously. The wrapper awaits
    // the adapter, then delegates — the AbortSignal flows straight through.
    return (async function* () {
      const adapter = await getAdapter()
      yield* adapter.subscribe(args)
    })()
  },
}

export type { RealtimeEvent }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:node realtime.test`
Expected: PASS — the existing `inMemory realtime adapter`, `shouldDeliver`, and new `selectRealtimeAdapterKind` blocks all green.

- [ ] **Step 5: Document the env var**

In `.env.example`, immediately after the `REDIS_URL=redis://localhost:14521` line, add:

```bash
# Realtime cross-process pub/sub transport (ADR-0004). Background-job handlers
# run in a separate process (dev worker / prod Vercel Queue fn), so realtime
# events need a shared broker to reach SSE subscribers.
#   - DEV: leave unset — the selector falls back to REDIS_URL (local container).
#   - PROD: set this to the Upstash Redis TCP URL (rediss://default:<pwd>@<host>:<port>).
#     DO NOT set REDIS_URL in prod — queue.ts would switch the job producer to
#     BullMQ, which has no prod consumer, breaking all background jobs.
REALTIME_REDIS_URL=
```

- [ ] **Step 6: Verify the full build typechecks**

Run: `pnpm build`
Expected: Vite build + `tsc --noEmit` succeed (the dynamic `import('./adapters/redis')` resolves now that Task 1 created the file).

- [ ] **Step 7: Format and commit**

```bash
pnpm check
git add src/lib/effects/realtime/realtime.ts src/lib/effects/realtime/realtime.test.ts .env.example
git commit -m "feat(realtime): select Redis adapter via REALTIME_REDIS_URL"
```

---

## Task 3: Relax the polling workaround & refresh comments

**Files:**
- Modify: `src/lib/queue/handlers/heicTranscode.ts:175-185`
- Modify: `src/routes/_authenticated/recommendations.index.tsx:50-56`
- Modify: `src/components/recommendation/RecommendationDetailDialog.tsx:55-59`

> Load `vercel:react-best-practices` before editing the two `.tsx` files. No automated test — this is a timing/copy change verified manually in Task 5. Realtime is now the fast path; the poll becomes a slow safety net for events lost during an SSE reconnect (Redis pub/sub is fire-and-forget).

- [ ] **Step 1: Update the handler NOTE comment**

In `src/lib/queue/handlers/heicTranscode.ts`, replace the `publishRecommendation` doc comment (lines 175-185) with:

```ts
/**
 * Publish `recommendation.changed` for the recommendation owning this photo file.
 *
 * Realtime pub/sub uses a cross-process Redis adapter (ADR-0004 amendment), so
 * this event reaches connected browsers even though the worker runs in a
 * separate process — dev: `scripts/devQueueWorker.ts`; prod: a distinct Vercel
 * Queue function invocation. The recommendation queries keep a slow safety-net
 * poll (recommendations.index.tsx + RecommendationDetailDialog.tsx) only to
 * cover a Redis event missed during an SSE reconnect.
 */
```

- [ ] **Step 2: Relax the orb-grid poll**

In `src/routes/_authenticated/recommendations.index.tsx`, replace lines 50-56 (the comment + `refetchInterval`):

```ts
    // Realtime now pushes `recommendation.changed` cross-process once the HEIC
    // worker finishes (ADR-0004 Redis adapter), so the cover swaps in without a
    // reload. This slow poll is only a safety net: Redis pub/sub is fire-and-
    // forget, so an event published during a brief SSE reconnect is lost — the
    // 15s refetch (self-terminating once no cover is pending) closes that gap.
    refetchInterval: (q) =>
      q.state.data?.some((p) => p.photos.some((ph) => ph.pending)) ? 15000 : false,
```

- [ ] **Step 3: Relax the detail-dialog poll**

In `src/components/recommendation/RecommendationDetailDialog.tsx`, replace lines 55-59 (the comment + `refetchInterval`):

```ts
    // Slow safety-net poll. Realtime pushes `recommendation.changed` cross-process
    // once the worker finishes (ADR-0004 Redis adapter); this only covers the gap
    // if that event is missed during an SSE reconnect. Self-terminating; mirrors
    // the orb poll.
    refetchInterval: (q) => (q.state.data?.photos.some((ph) => ph.pending) ? 15000 : false),
```

- [ ] **Step 4: Verify the build still typechecks**

Run: `pnpm build`
Expected: success.

- [ ] **Step 5: Format and commit**

```bash
pnpm check
git add src/lib/queue/handlers/heicTranscode.ts src/routes/_authenticated/recommendations.index.tsx src/components/recommendation/RecommendationDetailDialog.tsx
git commit -m "refactor(recommendation): relax HEIC poll to a realtime safety net"
```

---

## Task 4: Documentation & ADR

**Files:**
- Modify: `docs/adr/0004-realtime-sync-architecture.md`
- Modify: `docs/adr/0007-background-job-queue-architecture.md`
- Modify: `docs/adr/0011-presence-online-status-architecture.md`
- Modify: `CLAUDE.md`
- Modify: `<memory>/reference-realtime-publish-in-process-only.md` + `<memory>/MEMORY.md`

> **ADR decision (per the user's ask):** amend **ADR-0004** rather than create a new ADR. This change *fulfils* ADR-0004's own documented revisit trigger ("swap the in-memory adapter for Redis without touching call sites"), so the record belongs in that ADR's history alongside the original decision. ADR-0007 and ADR-0011 get one-line cross-references.

- [ ] **Step 1: Amend ADR-0004**

Append a dated amendment to `docs/adr/0004-realtime-sync-architecture.md` (match the amendment style used in ADR-0006). Capture:
- **What changed:** added `src/lib/effects/realtime/adapters/redis.ts` (oRPC `IORedisPublisher`); `realtime.ts` now selects it via `selectRealtimeAdapterKind` on `REALTIME_REDIS_URL` (dev falls back to `REDIS_URL`); tests + no-Redis dev keep `inMemory`.
- **Why:** the in-process bus could not deliver background-worker publishes (separate process in dev *and* prod) — this realized the revisit trigger.
- **Transport:** Redis pub/sub; dev = existing container, prod = Upstash (Vercel Marketplace, free tier). `source` rides the JSON envelope so `shouldDeliver` echo-suppression works cross-instance.
- **Critical:** `REALTIME_REDIS_URL` is deliberately separate from `REDIS_URL` (the latter flips the queue producer to BullMQ — see ADR-0007).
- **Still deferred:** presence *state* distribution (see ADR-0011); event resume (`IORedisPublisher.resumeRetentionSeconds` left off — reconnect = fresh subscribe).

- [ ] **Step 2: Cross-reference ADR-0007 and ADR-0011**

- In `docs/adr/0007-...md`: add a note that worker→browser realtime now works via ADR-0004's Redis adapter, and reiterate that `REDIS_URL` must stay unset in prod so the producer stays on Vercel Queues.
- In `docs/adr/0011-...md`: add a note that `presence.changed` *events* now cross instances via the Redis bus, but the `listOnline` refcount *state* remains per-instance (correct for the single warm web instance; revisit together with multi-instance).

- [ ] **Step 3: Update CLAUDE.md**

- Add a "Decisions made" bullet: `**Cross-process realtime via Redis pub/sub** (2026-06-30). Realtime bus gained a `redis` adapter (oRPC `IORedisPublisher`) selected by `REALTIME_REDIS_URL` (dev falls back to `REDIS_URL`; tests stay in-memory); worker-published events now reach browsers in dev + prod. Prod = Upstash; `REDIS_URL` stays unset in prod (else the queue producer breaks). See ADR-0004 amendment.`
- In the env-vars section, add `REALTIME_REDIS_URL` (dev: unset/fallback; prod: Upstash TCP `rediss://`; the `REDIS_URL`-in-prod warning).
- Update the `dev:worker` line / queue-topic note to mention the worker's realtime publishes now reach browsers via Redis.

- [ ] **Step 4: Update auto-memory**

- Rewrite `reference-realtime-publish-in-process-only.md`: its "Poll-while-pending instead" conclusion is superseded — worker `realtime.publish` now reaches browsers via the Redis adapter (`REALTIME_REDIS_URL`); a slow poll remains only as a reconnect safety net.
- Update the corresponding one-line hook in `MEMORY.md`.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0004-realtime-sync-architecture.md docs/adr/0007-background-job-queue-architecture.md docs/adr/0011-presence-online-status-architecture.md CLAUDE.md
git commit -m "docs(adr-0004): record Redis pub/sub realtime transport"
```

(Memory files live outside the repo — save them with the Write tool; they are not part of the git commit.)

---

## Task 5: Provision Upstash & verify end-to-end

**Files:** none (ops + manual verification).

> No automated test. This task wires prod and verifies the whole flow. The `add_repo`/Vercel env steps may be performed by the repo owner.

- [ ] **Step 1: Local end-to-end (the worker→browser path)**

```bash
pnpm dev:up          # db + queue(redis) + mail + storage + migrate
pnpm dev             # terminal A — Vite/Nitro on :14500 (selector picks redis via REDIS_URL)
pnpm dev:worker      # terminal B — BullMQ worker (also picks redis)
```
In the browser: sign in, create a recommendation, upload a **HEIC** cover.
- Expected: the cover swaps to the real image within ~1s of the worker completing — **before** any 15s poll fires.
- Network panel: **no** repeating `recommendation.list` poll at 3s; a single invalidation-driven refetch after the worker finishes.
- Dev-server logs show the SSE subscriber delivering `recommendation.changed`; worker logs show `job completed`.

- [ ] **Step 2: Regression — cross-tab mutations & presence**

- Two browser tabs as two different users: a profile/share/document mutation in one invalidates the other's queries (now routed through Redis, echo-suppressed for the actor).
- Open/close a second session: the online indicator still updates (`presence.changed` still flows).

- [ ] **Step 3: Provision Upstash Redis (prod)**

- Vercel dashboard → project → Storage / Marketplace → add **Upstash Redis** (free tier).
- From the Upstash console, copy the **TCP** connection string (`rediss://default:<pwd>@<host>:<port>`), **not** the REST URL.

- [ ] **Step 4: Set the prod env var**

- Vercel → Project → Settings → Environment Variables: add `REALTIME_REDIS_URL` = the Upstash TCP URL, for **Production** (and **Preview** if realtime is wanted on PR previews).
- Confirm `REDIS_URL` is **NOT** set in any Vercel environment.

- [ ] **Step 5: Deploy & verify in prod/preview**

- Deploy a Preview. Open the app, trigger a HEIC/thumbnail job, confirm the browser updates in real time without the slow poll.
- Vercel runtime logs: the SSE function and the queue function are both healthy; jobs still process (queue stayed on Vercel Queues — `REDIS_URL` unset).

---

## Self-Review

**1. Spec coverage** — Redis adapter (T1) ✓; env-selected facade with the `REDIS_URL`-collision guard (T2) ✓; `.env.example` (T2) ✓; polling relaxation + comment refresh (T3) ✓; ADR amendment + ADR-0007/0011 notes + CLAUDE.md + memory (T4) ✓; Upstash provisioning + dev & prod verification (T5) ✓. The `RealtimeEffects` interface, SSE procedure, `useRealtimeSync`, and event schema are untouched, as required.

**2. Placeholder scan** — no TBD/TODO/"handle edge cases"; every code step shows full code; commands have expected output. The one explicit gap is by design: the experimental `IORedisPublisher` API is to be confirmed against the installed types in T1 Step 0 (verified against current docs), since the package is pre-1.0.

**3. Type consistency** — `createRedisRealtime(url: string): RealtimeEffects` (T1) is consumed verbatim by `getAdapter` (T2). `selectRealtimeAdapterKind(env): 'inMemory' | 'redis'` (T2 impl) matches its tests (T2 Step 1). `CHANNEL = 'event'` and the `{ event, source }` envelope match `inMemory.ts` exactly, so both adapters satisfy the same `RealtimeEnvelope` shape. The `refetchInterval` predicate keys (`p.photos`, `ph.pending`) are unchanged from the current code — only the interval constant (3000 → 15000) and comments change.

---

## Execution Handoff

Implementation is deferred to a **separate PR** (per the user). When ready, use **superpowers:subagent-driven-development** (fresh subagent per task + two-stage review) or **superpowers:executing-plans** (inline, batched with checkpoints). Tasks 1–4 are the PR; Task 5 (Upstash + prod env) is the deploy step the repo owner completes.
