# ADR 0004 — Realtime Sync Architecture

- **Status**: Accepted
- **Date**: 2026-05-21
- **Deciders**: Lukas
- **Decision in one line**: Push state changes to every authenticated tab through a typed `realtime` effect — oRPC mutation procedures call `realtime.publish(event)` after the service commit, a single SSE procedure forwards events to subscribers, and one per-tab `useRealtimeSync()` hook turns each event into a `queryClient.invalidateQueries({ queryKey: orpc.<namespace>.key() })`. The bus is an in-process `MemoryPublisher` because we run as a single Vercel function instance.

---

## Context

Oceanview is a multi-user app (10–20 owners + admins) where most screens read shared state — the user roster today; soon also the season grid, share assignments, the file library, and boat-week scheduling. When one admin mutates state in one tab, every other tab that's currently viewing affected data needs to refetch within a small number of hundreds of milliseconds without anyone reloading the page. The existing data layer (oRPC + TanStack Query, [ADR-0002](./0002-service-domain-architecture.md)) already knows how to refetch — it just needs to be told *when*.

Today only the **user** entity opts in (`src/lib/orpc/procedures/user.ts`), and only one event variant exists (`user.changed`). The same pattern is intended to spread across every shared-state entity. Writing this down now sets the shape so each new entity owner doesn't reinvent the event name, the publish site, or the dispatch hook.

The behaviour is also subtly in tension with [ADR-0001](./0001-side-effects-architecture.md) ("skip in-process pub/sub"). That tension is real and worth reconciling once, in writing, so future readers don't relitigate the same trade-off every time another entity adopts the pattern.

---

## Decision (TL;DR)

Server-push invalidation, end-to-end:

1. **Publisher** — every oRPC mutation procedure calls `await realtime.publish({ kind: '<namespace>.changed', ids: [...] })` **after** the service mutation succeeds and after any sync-critical side effect (e.g. session revoke).
2. **Bus** — the `realtime` effect (`src/lib/effects/realtime/`) wraps `@orpc/experimental-publisher`'s `MemoryPublisher` on a single `'event'` channel. In-process, single-instance.
3. **SSE handler** — `protectedProcedure` `realtime.events` (`src/lib/orpc/procedures/realtime.ts`) is an `async function*` with `.output(eventIterator(realtimeEventSchema))` — that combination flips oRPC's `RPCHandler` into SSE-encoder mode. It forwards `realtime.subscribe({ signal, log: context.log })` to the client. `signal` is wired by oRPC to both client disconnect and function shutdown.
4. **Subscriber hook** — `useRealtimeSync()` (`src/hooks/useRealtimeSync.ts`) is mounted **once** in `src/routes/_authenticated.tsx`. It opens a single SSE stream, iterates events, and `switch`es on `event.kind` to `queryClient.invalidateQueries({ queryKey: orpc.<namespace>.key() })`. Reconnects with `exponential-backoff` (1s → 30s cap, ×2, full jitter, infinite attempts, stop on `UNAUTHORIZED`).
5. **Event schema** — `realtimeEventSchema` in `src/lib/effects/realtime/types.ts` is a discriminated union on `kind`. `kind` is always `<namespace>.changed` where `<namespace>` is the top-level `appRouter` key the client should invalidate. `ids` is optional metadata for future fine-grained patching; coarse invalidation ignores it.

This keeps the **interface** small (two functions on the effect, one event schema), the **implementation** swappable (in-memory today; Postgres `LISTEN/NOTIFY` or Redis later if we ever multi-instance), and the **locality** intact (the procedure reads top-to-bottom: validate → service → publish; the hook reads top-to-bottom: open → dispatch → reconnect).

---

## Why not the obvious alternatives

### A. Polling
- ➖ Wastes bandwidth proportional to `tabs × queries × frequency`. With ~20 users on a free tier, this isn't a cost problem but it's a UX problem — either too slow (30s interval) or wasteful (3s).
- ➖ No fan-out signal; clients refetch even when nothing changed.
- ➖ Doesn't compose with TanStack Query's existing invalidation primitives — every query would need its own polling config.
- **Verdict**: rejected. Server-push is cheaper and lower-latency.

### B. WebSockets
- ➕ Bidirectional, well-understood.
- ➖ Bidirectional capacity we don't need — only the server pushes here.
- ➖ Doesn't ride plain HTTP cleanly through Vercel fluid compute; SSE does, and oRPC has first-class `eventIterator` support that produces SSE on the same `/api/rpc` mount point we already use for everything else.
- ➖ More moving parts (heartbeats, frame protocol, sticky sessions).
- **Verdict**: rejected. SSE is the cheaper match for a one-way fan-out.

### C. Per-record fine-grained patches (apply event payload → patch React Query cache directly)
- ➕ Avoids the refetch round-trip.
- ➖ Premature. Coarse `invalidateQueries({ queryKey: orpc.<namespace>.key() })` is correct until a query is heavy enough that the refetch hurts. Today no query is heavy enough.
- ➖ Requires the event to carry the full new shape, which fights against the "thin event, fat refetch" model and forces the publisher to know what every consumer needs.
- **Verdict**: deferred. `ids` is reserved in the schema for the day this becomes worth doing; until then, dispatch ignores it.

### D. External pub/sub broker (Redis, Postgres `LISTEN/NOTIFY`, Vercel Queues)
- ➕ Required if we ever run more than one Vercel function instance, because in-memory pub/sub doesn't fan out across processes.
- ➖ Today we run a single instance; the broker buys nothing. Adding it now is speculative complexity.
- **Verdict**: deferred until [Revisit triggers](#revisit-triggers) fire. When it lands, only `src/lib/effects/realtime/adapters/` gains a new adapter — publish/subscribe call sites don't change.

---

## Why this isn't the in-process pub/sub that ADR-0001 forbade

[ADR-0001](./0001-side-effects-architecture.md) rejects in-process event buses, with most of the argument resting on: "decoupling between code units in the same monorepo is cosmetic", "fire-and-forget on Vercel is unsafe", "no durability". That all still applies — to the case ADR-0001 was about, which is *code-to-code decoupling inside one request lifecycle*. The textbook example: `user.deleted` fires → an `auditLog` listener and an `emailWelcomeAdmin` listener both run. ADR-0001's answer is: don't; call them directly from the procedure, behind the typed `effects/` seam.

Realtime sync is a different problem:

| Trait | ADR-0001's rejected pub/sub | Realtime sync |
|---|---|---|
| Producer and consumer in the same request lifecycle? | Yes — same call stack. | No — producer is a mutation request, consumer is a long-running SSE request held by a different tab (often a different user). |
| Number of consumers? | Almost always one. | One per open authenticated tab — genuinely N, and N grows with the user count. |
| Listener registration spread across the codebase? | Yes — that's the "hidden control flow" complaint. | No — exactly one subscriber type (`useRealtimeSync`), exactly one dispatch site. |
| Durability needed? | Sometimes — addressed by the outbox tier. | No — events lost across a disconnect are reconstructed by the next route observe (TanStack Query refetches stale queries automatically). |
| "Decoupling" benefit? | Cosmetic. | Real — the publisher can't call into the SSE response stream directly; pub/sub is the actual mechanism that decouples one request from another. |

So: ADR-0001 rejects pub/sub *between code units inside one process call stack*. Realtime sync uses pub/sub *between distinct request lifecycles inside one process*. Same word, different problem. The seam is genuine here in a way it isn't in ADR-0001's territory.

---

## Architecture

### Three roles

```
┌─ tab A (admin) ──────┐                                       ┌─ tab B (user) ───────┐
│ mutation request     │                                       │ SSE request          │
│   procedure.update() │                                       │   procedure.events() │
│     userService.x()  │                                       │     subscribe()      │
│     realtime.publish ├──► MemoryPublisher (channel='event') ─┤     yield event      │
└──────────────────────┘                                       │     ...              │
                                                               │   useRealtimeSync    │
                                                               │     dispatch(event)  │
                                                               │     invalidateQueries│
                                                               │     refetch route    │
                                                               └──────────────────────┘
```

**Publisher** — oRPC mutation procedures. They already own the orchestration (validate → service → side effects); `realtime.publish(...)` is the last step.

**Bus** — `src/lib/effects/realtime/` (the `realtime` effect). Owns the in-memory publisher and the typed event schema. Two functions on the interface (`publish`, `subscribe`), one channel, one discriminated-union event type.

**Subscriber** — the SSE procedure on the server forwards events to a single `useRealtimeSync()` hook in the browser. The hook is mounted in `src/routes/_authenticated.tsx` so the connection lives for the entire authenticated session. The hook does **all** dispatch in one `switch` over `event.kind`.

### Where to publish — in the procedure, after the service call

A procedure that mutates state ends with the realtime publish:

```ts
update: adminProcedure
  .input(userInputSchema.extend({ id: z.uuid() }))
  .handler(async ({ input, context }) => {
    try {
      const updated = await userService.updateAsAdmin(context.user.id, input.id, { ... })
      context.log.info('admin updated user', { targetId: input.id, role: input.role })
      await realtime.publish({ kind: 'user.changed', ids: [updated.id] })
      return updated
    } catch (err) {
      rethrowAsORPC(err, 'update')
    }
  }),
```

Rules:
- Publish **after** the service call returns successfully — never before, never inside the service. Services are DB-only ([ADR-0002](./0002-service-domain-architecture.md)) and must not import the `realtime` effect.
- Publish **after** any sync-critical side effect that must succeed before clients see the change (e.g. `auth.api.revokeUserSessions` on delete — see `procedures/user.ts:92-103`).
- Publish on **every** state-changing mutation for an opted-in entity, including create, update, delete, restore. Missing one publish means every client sees stale data until they navigate.

### Where to subscribe — once per authenticated tab

```ts
// src/routes/_authenticated.tsx
function AuthenticatedLayout() {
  useRealtimeSync()
  // ... layout shell
}
```

Rules:
- Exactly one `useRealtimeSync()` mount, in `_authenticated.tsx`. Don't add per-route subscriptions — one stream per tab is the contract.
- Public routes (`/login`, the auth callback) do **not** subscribe.
- The hook owns the reconnect loop; consumers never reach for the raw `client.realtime.events(...)` call.

### Event schema rules

```ts
// src/lib/effects/realtime/types.ts
export const realtimeEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user.changed'), ids: z.array(z.string()).optional() }),
  // Add per-entity variants here as they adopt.
])
```

- `kind` is always `<namespace>.changed`, where `<namespace>` is the top-level `appRouter` key the client should invalidate. Today: `user.changed` → invalidates `orpc.user.key()`. Tomorrow: `season.changed` → `orpc.season.key()`, `share.changed` → `orpc.share.key()`.
- `ids` is metadata, not a payload. Coarse invalidation ignores it. It exists so a future fine-grained variant can patch the cache without a schema break.
- One variant per entity is the default. Don't pre-split into `user.created` / `user.updated` / `user.deleted` — the client doesn't care which mutation happened, only that the namespace is dirty.

### Why this is a deep module

In the architecture skill's vocabulary:

- **Interface** — two functions on `RealtimeEffects` (`publish`, `subscribe`) plus the typed event schema. Stable; new entities extend the schema's discriminated union, not the interface.
- **Implementation** — `MemoryPublisher` channel routing, SSE encoding via `eventIterator`, `AbortSignal` teardown on disconnect and shutdown, reconnect-with-backoff and full jitter, coarse invalidation policy in the browser hook. All hidden.
- **Two seams** — the `RealtimeEffects` interface (real seam: in-memory today, broker-backed adapter tomorrow if multi-instance lands) and the event-schema enum (one variant per opted-in namespace).
- **Test surface = the interface** — `realtime.test.ts` exercises publish/subscribe/abort against the real `MemoryPublisher`. No mocks. The deletion test passes: removing this module would re-scatter `MemoryPublisher`, the SSE handler, the schema, the dispatch switch, and the reconnect loop across every entity's procedures and routes.

---

## Operational constraints

### Single-instance Vercel fluid compute

The in-memory `MemoryPublisher` works **only** because publisher and subscriber are in the same Node process. Vercel's fluid compute keeps a single instance warm under our load profile, so a mutation in tab A and the SSE handler serving tab B run inside the same process. If we ever scale to >1 instance — explicit horizontal scaling, region failover, or anything else that splits the process pool — events published on one instance are invisible to subscribers on others. That's a revisit trigger, not a current concern. The migration when it lands is: write a new adapter (Postgres `LISTEN/NOTIFY` is the cheapest first step — no new vendor) and point `realtime` at it. Publish and subscribe call sites don't change.

### Reconnection

The browser hook uses `exponential-backoff` with: starting delay 1s, ×2 multiplier, max delay 30s, full jitter, infinite attempts. Two reasons to stop the retry loop:
- The `AbortController` is aborted by the hook's cleanup (component unmount, logout).
- The server returns `UNAUTHORIZED` (the session expired or was revoked) — logged at `error` level and not retried.

All other failures (network drop, server restart, function cold-restart between deploys) retry until the next attempt succeeds. The reconnect is intentionally noisy at `warn` level in the browser logger so client crashes mid-stream show up in `/api/log`.

### Shutdown teardown

The server handler is `async function*`. oRPC wires `signal` to two sources: client disconnect (TCP RST or `AbortController` from the browser) and function shutdown (Vercel sending SIGTERM during a deploy). The handler's `try/finally` logs both ends:

```ts
context.log.info('realtime subscriber connected')
try {
  for await (const event of realtime.subscribe({ signal, log: context.log })) {
    yield event
  }
} finally {
  context.log.info('realtime subscriber disconnected')
}
```

### No durability — and that's fine

If a client disconnects, every event published during the gap is dropped. That's deliberate. TanStack Query's default behaviour refetches stale queries on the next observation (route mount, window focus). So the worst case from a missed event is: a user opens the route a second later than they would have, and the data is up-to-date by the time they look. No replay log needed.

This is the same reason no outbox tier (per [ADR-0001](./0001-side-effects-architecture.md)) is necessary here — there's no durability requirement to satisfy.

---

## How to add a new event kind

When an entity (e.g. `share`) needs realtime sync:

1. **Extend the schema.** Add a variant to `realtimeEventSchema` in `src/lib/effects/realtime/types.ts`:
   ```ts
   z.object({ kind: z.literal('share.changed'), ids: z.array(z.string()).optional() }),
   ```
   The `kind` literal must be `<namespace>.changed`, where `<namespace>` matches the top-level `appRouter` key.

2. **Add a dispatch case.** Extend the `switch` in `src/hooks/useRealtimeSync.ts`:
   ```ts
   case 'share.changed':
     void queryClient.invalidateQueries({ queryKey: orpc.share.key() })
     return
   ```

3. **Publish from every mutation procedure** for that entity (`src/lib/orpc/procedures/share.ts`):
   ```ts
   await realtime.publish({ kind: 'share.changed', ids: [/* affected ids */] })
   ```
   After the service call returns. After any sync-critical side effect. Before returning to the caller.

4. **No DB, no migration, no schema.ts change.** The bus is in-memory; the channel is shared across all event kinds; the discriminated union does all the type-routing.

That's the whole recipe. No new files in `effects/realtime/`. No changes to the SSE handler. No changes to `_authenticated.tsx`.

---

## Critical files

- `src/lib/effects/realtime/realtime.ts` — `RealtimeEffects` interface, `realtime` export.
- `src/lib/effects/realtime/types.ts` — `realtimeEventSchema` discriminated union. **Extend here for new event kinds.**
- `src/lib/effects/realtime/adapters/inMemory.ts` — `MemoryPublisher` adapter on the `'event'` channel.
- `src/lib/effects/realtime/realtime.test.ts` — interface contract tests against the real `MemoryPublisher`.
- `src/lib/orpc/procedures/realtime.ts` — SSE handler (`realtime.events`).
- `src/lib/orpc/procedures/<entity>.ts` — publish sites (`procedures/user.ts:70,85,103,113` is the canonical pattern).
- `src/lib/orpc/router.ts` — registers `realtime: realtimeRouter`.
- `src/hooks/useRealtimeSync.ts` — browser subscriber + dispatch + reconnect loop. **Extend the `switch` here for new event kinds.**
- `src/routes/_authenticated.tsx` — the single `useRealtimeSync()` mount.

---

## Verification

Adding a new event kind is correctly wired when:

- The new variant compiles cleanly in `realtimeEventSchema` — TypeScript narrows the `switch` and forces the new `case` in `useRealtimeSync`'s dispatch.
- `pnpm test` passes — no test change is required for new event kinds; the existing `realtime.test.ts` covers the publisher contract.
- Grep `src/lib/orpc/procedures/<entity>.ts` for every mutation handler — each one ends with `await realtime.publish({ kind: '<namespace>.changed', ids: [...] })`.
- `pnpm dev`, open the app in two tabs as an admin, mutate the entity in tab A — tab B's affected route refetches within a few hundred milliseconds with no manual reload.
- Disconnect the network on tab B briefly, then restore — the browser console logs `realtime connection lost` (warn) and `realtime subscription opened` (info); the next mutation propagates.

Drift checks for this ADR itself:
- Grep `'.changed'` across `src/lib/effects/realtime/types.ts`, `src/hooks/useRealtimeSync.ts`, and `src/lib/orpc/procedures/` — counts must agree (one schema variant ↔ one dispatch case ↔ one or more publish sites).
- Grep `src/lib/services/` for `realtime` — must return zero hits (services don't publish).
- Grep `src/routes/` for `useRealtimeSync` — must return exactly one hit, in `_authenticated.tsx`.

---

## Consequences

**Positive**
- Mutations in one tab become visible in every other authenticated tab within a few hundred milliseconds, with no client-side work per route.
- One named seat for the entire realtime pipeline — schema, bus, SSE handler, hook all colocated.
- New entities adopt in ~5 lines of code (schema variant + dispatch case + publish calls).
- The interface stays small: `publish` / `subscribe` plus the schema. The implementation can be swapped (e.g. Postgres `LISTEN/NOTIFY`) without touching any call site.

**Negative**
- Hard dependency on single-instance deployment. The day we scale horizontally, the in-memory adapter has to be replaced before realtime sync survives.
- Coarse invalidation can over-refetch when a screen displays unrelated rows from the same namespace. Acceptable today; revisit per-query if a refetch turns expensive.
- No durability — disconnected clients miss intermediate events. Recovered automatically by TanStack Query's stale-query refetch, but worth knowing.

---

## Revisit triggers

Re-open this ADR if any of these change:

- We run more than one Vercel function instance — explicit horizontal scaling, multi-region, sticky-session failover, anything that splits the process pool. The in-memory bus stops working at that point; swap in a Postgres `LISTEN/NOTIFY` or Redis adapter.
- A single query becomes expensive enough that coarse `invalidateQueries({ queryKey: orpc.<namespace>.key() })` causes a noticeable latency or load spike. Then the `ids` field starts earning its keep — dispatch reads it and patches specific entries instead of invalidating the whole namespace.
- An event needs to survive a client disconnect (e.g. "user must see this notification even if their tab was closed when it fired"). That's an outbox-tier problem ([ADR-0001](./0001-side-effects-architecture.md)), not a realtime-sync problem; the right answer is a durable side effect plus a per-user inbox query, not retrofitting durability onto this pipeline.
- The free tier of an external broker (Vercel Queues, Upstash Redis) starts looking cheaper than maintaining the in-memory + outbox split. Then the broker absorbs both responsibilities.
