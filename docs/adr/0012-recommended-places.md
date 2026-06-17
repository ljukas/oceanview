# ADR 0012 — Recommended Sailing Places

- **Status**: Proposed
- **Date**: 2026-06-14
- **Deciders**: Lukas
- **Decision in one line**: A map feature where owners pin photo "orbs" of places they've sailed to — render with **MapLibre GL JS** (open engine) over **MapTiler** tiles (the tile provider is a swappable adapter behind the engine, like R2 in ADR-0006); store one photo per recommendation as a `file` row referenced by FK (the **avatar pattern**, not a `document` wrapper) and serve three sizes (orb / dialog / full) on demand from the `unpic` transformer with **no thumbnail worker**; **guess the location from the photo's EXIF GPS client-side** (`exifr`, editable, manual fallback); model location as two `double precision` columns with **client-side Haversine** distance (no PostGIS); tag recommendations from a **shared, normalized `tag` table** (~10 localized system tags + deduped user-created tags); and **design — but not yet build — likes and comments** as future phases.

---

## Context

ADR-0006 wired the byte-path (storage adapters, public/private stores, the three-step mint→PUT→confirm upload flow, the `file` metadata table). ADR-0010 layered document *management* on top of `file`. This ADR adds a different consumer of the same primitives: a **place-recommendation map**.

The boat lives in the Ionian, around Lefkada. Owners accumulate local knowledge — a quiet anchorage on the east coast, a taverna in Vasiliki, a cove worth the detour — and today that knowledge lives in their heads and group chats. The shape of the need:

- A **map** centered on Lefkada showing every recommended place as a photo **orb**.
- Tapping an orb opens a **detail view** — a larger photo and the author's note on *why* it's recommended.
- Creating a recommendation means uploading a photo. Phone photos carry **EXIF GPS**, so we **guess the location** and drop the marker there; the author nudges it if the guess is off (or places it by hand when the photo has no GPS).
- Over time: **likes** so good spots float to the top, and **comments** for discussion.

### Why this is a new ADR (the deletion test)

Delete the recommendation module and ask what survives. The storage byte-path, the avatar flow, the document library, realtime, the queue — all untouched. What reappears, and only here, is: the map, orbs, places, EXIF-derived locations, tags, and (later) likes/comments. Complexity *concentrates* in this module rather than leaking back into the seams it sits on. That is the signal that it earns its own ADR rather than an amendment to ADR-0006.

### Seams it consumes — none of them change

This feature is a **consumer**, not a modification, of five existing seams:

- **Storage** (ADR-0006) — `storage.mintUploadToken` / `head` / `delete` / `getReadUrl`, public store, env-prefixed pathnames. Untouched.
- **Realtime** (ADR-0004) — `realtime.publish(...)` + the single `useRealtimeSync()` dispatcher. We add event kinds; the bus is unchanged.
- **Queue** (ADR-0007) — the `blurhash` topic. We add a `'recommendation'` kind to the existing handler; no new topic.
- **Service / domain-error** (ADR-0002, 2026-06-13 amendment) — services own DB access; procedures surface `<Entity>DomainError` as **code-only typed oRPC errors** (status only, no backend i18n) and the client localizes by code. We follow the newer `document`/`folder` router pattern, not the older `rethrowAsORPC`-to-Swedish one.
- **Forms** (ADR-0005) — `useAppForm` + bound fields.

### The one genuinely new seam: map rendering

The only new architectural seam this ADR introduces is **map rendering**. MapLibre GL JS is the deep module — pan, zoom, vector-tile rendering, markers, styles, all behind a small `<Map>` / `<Marker>` interface — and the **tile provider is the adapter** at that seam.

This is a **one-adapter seam that stays reversible**, not a proven multi-adapter seam — and the ADR is honest about the difference (the skill's rule: *one adapter = not yet a proven seam, two = real seam*). We don't claim hidden depth from a single provider; the leverage we *do* have is that MapLibre's interface is a standard style URL, so swapping MapTiler for Stadia, OpenFreeMap, or a self-hosted Protomaps extract is a config change, not a rewrite. This is exactly the posture ADR-0006 takes toward R2 — design and document the swap, don't build it twice.

### Where we deliberately refuse shallow modules

Each of these passes the deletion test the *other* way — delete the would-be module and no complexity reconcentrates, because an existing seam already covers the need. So the module would be shallow, and we don't build it.

- **No `document`-style wrapper for the photo.** ADR-0010 added `document` over `file` because documents carry real management concerns (folders, search, bin, history, rename-with-storage-copy). A recommendation's photo has none of those. Delete a hypothetical wrapper and callers simply read the `file` row directly, exactly as avatars do — no complexity reappears. Shallow; don't build it.
- **No `image_thumbnail` worker.** That worker exists in ADR-0010 *only* because documents live in the private store behind signed per-read URLs that Vercel Image Optimization can't address (ADR-0010 Alternative L). Recommendation photos live in the **public** store; delete a hypothetical worker and the `unpic` transformer already serves on-demand sizes — a worker would only duplicate it. Shallow; don't build it.
- **No PostGIS.** Sorting a few dozen already-loaded points by distance does not justify a spatial extension. Delete a hypothetical PostGIS column and the pure `haversineKm` helper already covers the need with full locality. Shallow; don't add it.

### Where the new depth is

The **`tag` module**: a small interface (`listTags`, `createCustomTag(label)` with lowercase dedup) hides the system/custom duality and the localization seam — system tags carry a stable `slug` rendered through a `slug → m.tag_<slug>()` registry; custom tags carry a raw `label` rendered verbatim (data, not UI — like a username).

---

## Decision (TL;DR)

A place-recommendation map with the following load-bearing pieces:

1. **Map engine = MapLibre GL JS** via `@vis.gl/react-maplibre`. The map components are **client-only** — MapLibre needs `window` / WebGL and does not server-render. The idiom: gate rendering on a `mounted` flag (`const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), [])`) and return a **same-shape placeholder** on the server pass (`<div className="size-full …" />`), never `return null` (that's a hydration mismatch). `maplibre-gl` + `@vis.gl/react-maplibre` are browser-only, so add them to `ssr.external` in `vite.config.ts` (or lazy-import the map component) so they stay out of the SSR bundle; the CSS (`maplibre-gl/dist/maplibre-gl.css`) is imported once. Default style = **satellite** (coastal use); initial view centered on Lefkada (~`{ longitude: 20.65, latitude: 38.70 }`) with `maxBounds` around the Ionian (e.g. `[[19.5, 37.5], [21.5, 39.5]]`) and a touch-sized `NavigationControl`.

2. **Tiles = MapTiler**, behind the open engine. Style URL `https://api.maptiler.com/maps/<style>/style.json?key=${import.meta.env.VITE_MAPTILER_API_KEY}` — the key is **client-exposed by nature** (the browser fetches the style), so it is *not* a secret; it is restricted by HTTP-referrer in the MapTiler dashboard. The provider is a swappable adapter (Stadia / OpenFreeMap / self-hosted Protomaps PMTiles are documented swap-ins).

3. **Photo = avatar pattern.** A `recommendation` row carries a `fileId` FK to a `file` row in the **public** store (`recommendations/{userId}/{uuid}.{ext}`). Blurhash reuses the `blurhash` queue topic (add a `'recommendation'` kind that only sets `file.blurhash` — no denormalization). **Three render sizes from the one stored original**, via the `unpic` transformer's `width` param:
   - **orb** ~64px (reuses the avatar `<Avatar>` / transformer `<img>`),
   - **dialog thumbnail** ~400px (200 @2×),
   - **full** a bounded ~2048px transform.
   No separate thumbnail asset, no `thumbnailPathname`, no `image_thumbnail` worker.

4. **EXIF location, guessed client-side.** Before upload (and before the existing HEIC→JPEG transcode, which can strip metadata), the client reads GPS from the original file with `exifr.gps(file)` and pre-fills the location marker. When GPS is absent (screenshots, re-saved/socially-shared images, location-off), the picker opens on Lefkada with no marker and the author places it by hand. The location is always editable.

5. **Location = two `double precision` columns** (`lat`, `lng`) with CHECK bounds. Distance ("sort by closest to me") is computed **client-side with a `haversineKm` helper** over the orbs already loaded for the map; "current location" comes from the browser Geolocation API, which the server never sees and never stores. On geolocation deny/error the sort **silently stays unsorted** (log, no toast). No PostGIS, no spatial index, no server-side distance.

6. **Tags = shared, normalized `tag` + `recommendation_tag` join**, multi-tag. ~10 **system** tags are seeded and localized via a `slug → m.tag_<slug>()` registry; **custom** tags are user-created, deduped on `lower(label)`, and shared globally so the vocabulary grows once and is reusable by everyone. The map can filter orbs by tag, client-side.

7. **Realtime.** Add `recommendation.changed` and `tag.changed` to the existing event union; the single `useRealtimeSync()` dispatcher invalidates `orpc.recommendation.key()` / `orpc.tag.key()`.

8. **Access model** (stated explicitly, echoing ADR-0010's amendment): reads (list, view, detail) are gated on **authentication only** — these are the shared recommendations of one boat's owners. **Create** is any authenticated owner; **edit/delete** is **author-or-admin** (service-level guard, admin bypass inside the service). Per-recommendation privacy is deliberately out of scope.

9. **Likes & comments** are **designed here as future phases** (schema + approach below) but **not built** in the first slice. The first slice is the map + photo + EXIF + tags.

---

## Alternatives considered

### Map engine

#### A. Leaflet (rejected)
- ➕ Simplest possible API; huge ecosystem; no API key needed with OSM raster tiles.
- ➖ Stale: 1.9.x dates from 2023, 2.0 is still alpha. Raster-first; vector/WebGL is a bolt-on.
- ➖ Raster tiles are heavier and blurrier on zoom than vector.
- **Verdict**: rejected — we don't want to start a 2026 feature on a 2023 raster-first engine.

#### B. Mapbox GL JS (rejected)
- ➕ Best-in-class styles and satellite imagery; mature React wrappers.
- ➖ GL JS v2+ is **proprietary** and couples the engine to Mapbox's tiles + access token. The "tile provider is a swappable adapter" property — the whole point of our seam — is lost; switching providers would mean rewriting the map component, not changing a URL.
- **Verdict**: rejected — the lock-in defeats the seam. Cost was never the deciding factor (every free tier dwarfs ~20 users).

#### C. MapLibre GL JS (chosen)
- ➕ Open-source WebGL vector engine (the community fork of Mapbox GL v1); TypeScript-native; consumes a standard style URL.
- ➕ Keeps the provider seam **cheap and real-on-demand** — MapTiler today, Stadia/OpenFreeMap/Protomaps tomorrow, no component rewrite.
- ➖ Needs `window`/WebGL → client-only (no SSR). Adds a client dependency.
- **Verdict**: chosen — the open engine is what makes the provider a swappable adapter.

### Tile provider

All free tiers exceed ~20 users by ~100×, so cost is not the differentiator — lock-in, imagery, and key management are.

- **MapTiler (chosen)** — open MapLibre engine + hosted tiles (satellite/outdoor/streets), ~100k tiles/mo free, one `VITE_MAPTILER_API_KEY`. Provider swappable because the engine is open. Satellite imagery is genuinely useful for reading a coastline.
- **Stadia Maps (runner-up)** — open engine; perpetual free, no credit card, explicitly licensed for non-commercial/low-volume — the cleanest license fit. Kept as the first swap-in.
- **OpenFreeMap (documented swap-in)** — no key, no signup, no limits, but an external community service with no SLA.
- **Protomaps PMTiles, self-hosted (documented swap-in)** — cut a small Ionian extract with the `pmtiles` CLI (a few MB), host it in the existing public Blob store, serve via HTTP range requests. Fully self-contained, free forever, zero external dependency — the same "own-it" posture R2 represents for storage. The future trigger to adopt it is below.

### Photo model

#### A. `document`-style 1:1 wrapper (rejected)
- ➕ Symmetrical with ADR-0010; reuses the document service shape.
- ➖ Shallow here: a recommendation photo has no folder, no search haystack, no bin, no history, no rename-with-copy. The wrapper would carry columns it never populates. Deletion test: remove the wrapper and no complexity reappears.
- **Verdict**: rejected — a wrapper with nothing to wrap.

#### B. Inline image columns on the recommendation row (rejected)
- ➕ Fewer joins; no `file` row.
- ➖ Duplicates the `file` lifecycle the byte-layer already owns — blurhash, soft-delete, storage cleanup, the `owner_id`/`pathname`/`mime`/`size` handling. We'd reimplement avatar plumbing inline.
- **Verdict**: rejected — re-solves a solved problem.

#### C. `fileId` FK / avatar pattern (chosen)
- ➕ Reuses the entire byte-layer: upload flow, storage seam, blurhash, public-store serving. Zero new file/worker machinery.
- ➕ Avatars already prove the shape (a `file` row with no `document` row).
- ➖ One join on read (trivial at this scale).
- **Verdict**: chosen.

### Image sizing

#### A. `image_thumbnail` background worker, à la ADR-0010 (rejected)
- ➕ Pre-rendered fixed-size WebP; consistent grid tiles.
- ➖ That worker exists **solely** to work around the private store's signed URLs, which VIO can't optimize. Public-store photos have no such constraint. Adding it here would be cargo-culting machinery.
- **Verdict**: rejected — wrong problem.

#### B. One stored original + on-demand transformer sizing, à la avatars (chosen)
- ➕ Three (or any) sizes from one original via the `unpic` transformer's `width` param. No worker, no extra asset, no `thumbnailPathname`.
- ➕ The "full" tier is a bounded-large transform (~2048px) — near-indistinguishable on screen, far lighter than raw multi-MB bytes, and CDN-cached by VIO.
- ➖ Dev caveat: the transformer passes through in dev (`import.meta.env.DEV`), so dev fetches full bytes per size. Acceptable at this scale — identical to avatars today.
- **Verdict**: chosen.

### Location / distance

#### A. PostGIS `geography(Point,4326)` (rejected for v1)
- ➕ Correct great-circle distance; `ST_Distance`/`ST_DWithin`; GiST KNN `<->`.
- ➖ Over-powered for sorting a few dozen points already held in memory client-side. Heavy extension + a Drizzle custom column type for power we wouldn't use.
- **Verdict**: rejected for v1; documented as the swap-in (trigger below).

#### B. `earthdistance` + `cube` (rejected)
- ➕ Lighter than PostGIS; `earth_distance(ll_to_earth(...))` + GiST.
- ➖ Clunky cube API; still server-side work this access pattern doesn't need.
- **Verdict**: rejected.

#### C. Native `point` type (rejected)
- ➕ Built-in; `<->` operator; GiST support.
- ➖ **Planar** — its distance is in degrees, and a degree of longitude at 38.7°N is ~22% shorter than a degree of latitude, so distances would be wrong.
- **Verdict**: rejected — silently incorrect.

#### D. Two `double precision` columns + client-side Haversine (chosen)
- ➕ Accurate (Haversine), zero extension, zero index. The map already loads all orbs and "current location" is a browser concern, so distance is naturally a client computation. Echoes ADR-0010's deliberate seq-scan-at-this-scale precedent.
- ➖ No server-side radius filtering (we don't need it; trigger documented).
- **Verdict**: chosen.

### Tags

#### A. Single-category FK (rejected)
- ➖ A place is often several things at once (a cove that's also a good anchorage with a taverna). One category can't express that.
- **Verdict**: rejected.

#### B. `text[]` array column (rejected)
- ➕ Simplest schema; GIN-indexable.
- ➖ No shared, governed vocabulary (every user respells "snorkling"); weak localization of the baseline tags.
- **Verdict**: rejected.

#### C. Shared normalized `tag` + `recommendation_tag` join (chosen)
- ➕ Multi-tag; ~10 localized system tags; custom tags deduped and shared so the vocabulary grows once. Clean filter-by-tag.
- ➖ A join table and a small tag service.
- **Verdict**: chosen.

### EXIF extraction

#### A. Server-side `sharp` in a worker (rejected)
- ➖ Bytes never transit a Function (ADR-0006); the server doesn't see the image. We'd need a fetch-back worker to read metadata the client already holds at upload time.
- **Verdict**: rejected — fights the out-of-process byte path.

#### B. Client-side `exifr` before upload (chosen)
- ➕ Reads GPS from the original file in the browser (handles HEIC + JPEG), before the HEIC transcode that would strip it. Sends `{ lat, lng }` in the create payload. Fits the byte path exactly.
- ➖ Not every photo has GPS — mitigated by manual placement.
- **Verdict**: chosen.

### Likes & comments — build now vs. design for later

- **Build now (rejected)** — widens the first slice well beyond the core value (map + photo + EXIF). Comments and votes are independent and additive.
- **Design for later (chosen)** — record the schema and approach so the first slice doesn't paint them into a corner, but ship the map first.

---

## Architecture

### Schemas (`src/lib/db/schema/recommendation.ts`)

Follows house conventions: uuid PK, `timestamptz`, `$onUpdate`, soft-delete, CHECK for physical truths (ADR-0006/0010; the 2026-05-26 timestamptz + CHECK decisions).

```ts
// recommendation
recommendation
  id          uuid pk defaultRandom
  author_id   uuid → user.id   on delete set null   -- preserve content if an owner is removed
  file_id     uuid unique → file.id on delete restrict   -- recommendation owns the byte lifecycle
  title       text not null
  description text                                   -- nullable: the "why"
  lat         double precision not null              -- coordinates as double; distance is JS Haversine
  lng         double precision not null
  created_at  timestamptz default now() not null
  updated_at  timestamptz default now() $onUpdate not null
  deleted_at  timestamptz                            -- soft-delete (author/admin)
  CHECK lat BETWEEN -90 AND 90
  CHECK lng BETWEEN -180 AND 180
  index (author_id); index (deleted_at) where deleted_at is null
```

```ts
// tag — system (seeded, localized) + custom (user-created, deduped, shared)
tag
  id            uuid pk defaultRandom
  is_system     boolean not null default false
  slug          text unique           -- set iff is_system (e.g. 'restaurant'); UI → m.tag_<slug>()
  label         text                  -- set iff custom (raw user text, rendered verbatim)
  created_by_id uuid → user.id on delete set null
  created_at    timestamptz default now() not null
  -- exactly one mode; explicit = true/false form for readability
  CHECK ((is_system = true  AND slug IS NOT NULL AND label IS NULL)
      OR (is_system = false AND slug IS NULL     AND label IS NOT NULL))
  -- custom-tag dedup: functional partial unique index (folder.ts pattern), no denormalized column
  UNIQUE INDEX (lower(label)) WHERE is_system = false

// recommendation_tag — many-to-many join
recommendation_tag
  recommendation_id uuid → recommendation.id on delete cascade
  tag_id            uuid → tag.id            on delete cascade
  primary key (recommendation_id, tag_id)   -- PK leads with recommendation_id (forward lookup free)
  index (tag_id)   -- reverse lookup (filter orbs by tag)
```

Custom-tag dedup is a **functional partial unique index on `lower(label)`** (the `folder.ts` partial-unique pattern) plus a **check-first** read in `tagService.createCustomTag` (CLAUDE.md "domain invariants are check-first") — no denormalized `normalized` column. The `recommendation_tag` PK leads with `recommendation_id`, so the forward lookup ("tags of this recommendation") is already indexed; only the reverse (`tag_id`) needs its own index.

The `file_id` unique constraint enforces the 1:1; `on delete restrict` means the recommendation's soft-delete (and the eventual byte cleanup) flows through the service, not a stray FK cascade. `author_id`/`created_by_id` use `set null` so content and tags outlive a removed owner, consistent with the event tables in ADR-0010.

**System tags** are seeded by a data-only migration (`drizzle-kit generate --custom --name=seed_system_tags`): `restaurant, anchorage, pier, cove, beach, marina, bar, snorkeling, provisioning, viewpoint`. Each has a matching `m.tag_<slug>()` message and a `slug → m.tag_<slug>()` entry in `src/components/recommendation/tagLabels.ts`.

The **first migration creates only `recommendation`, `tag`, and `recommendation_tag`.** The two tables below are listed for design reference and are **not** created until their slice is built — no migration should surface them before then.

#### Future-phase tables (designed, **not built** in the first slice)

```ts
recommendation_like              -- one toggleable like per user; premier by count
  recommendation_id uuid → recommendation.id on delete cascade
  user_id           uuid → user.id            on delete cascade
  created_at        timestamptz default now() not null
  primary key (recommendation_id, user_id)

recommendation_comment
  id                uuid pk defaultRandom
  recommendation_id uuid → recommendation.id on delete cascade
  author_id         uuid → user.id            on delete set null
  body              text not null
  created_at        timestamptz default now() not null
  updated_at        timestamptz default now() $onUpdate not null
  deleted_at        timestamptz               -- soft-delete
```

Both publish `recommendation.changed` on mutation. They are fenced off here so the first slice's schema and queries don't preclude them; nothing in the first migration creates them.

### Storage / EXIF flow (the avatar three-step, reused)

```
Client                                    Server (oRPC)                         Public Blob store
──────                                    ─────────────                         ─────────────────
1. read EXIF on original file
   exifr.gps(file) → { lat, lng } | null
   (then HEIC→JPEG transcode if needed)
2. orpc.recommendation.mintImageUpload ─► procedure
   { contentType, sizeBytes, fileName }   · session + Zod (image mime, size cap)
                                          · pathname recommendations/{userId}/{uuid}.{ext}
                                          · storage.mintUploadToken({ access:'public', ... })
3. PUT bytes (runUploadFlow) ───────────────────────────────────────────────►  PUT
4. orpc.recommendation.create  ─────────► procedure
   { title, description?, lat, lng,       · stripEnvPrefix(pathname).startsWith('recommendations/{userId}/')
     tagIds, pathname, mime, sizeBytes }  · storage.head('public', pathname) — verify the blob exists
                                          · service tx: insert file + recommendation + recommendation_tag rows
                                          · queue.publish('blurhash', { fileId, kind:'recommendation' })
                                          · realtime.publish({ kind:'recommendation.changed' }, { source:userId })
5. invalidateQueries(orpc.recommendation.key())
```

This is the avatar flow (`src/lib/orpc/procedures/image.ts`, `src/components/user/AvatarUpload.tsx`, `runUploadFlow` in `src/lib/effects/storage/clientUpload.ts`) reused verbatim — the only new server work is writing the recommendation + tag rows in the same transaction and choosing the `'recommendation'` blurhash kind.

### Service / procedure sketch

Services own all DB access (ADR-0002). Procedures are thin glue that surface domain errors as **code-only typed oRPC errors**, following the `document`/`folder` routers (`src/lib/orpc/procedures/{document,folder}.ts`) — **not** the older `rethrowAsORPC`-to-Swedish-`ORPCError` shape (`season`/`user` keep that; new code uses this). Per the 2026-06-13 ADR-0002 amendment:

- Each router declares a `recommendationErrors` / `tagErrors` map — `{ CODE: { status } } satisfies Record<<Entity>DomainErrorCode, { status: number }>`. The `satisfies` locks the keys to the domain code union, so adding a domain code **forces** a new entry (compile error otherwise). Attach with `.errors(recommendationErrors)` on each mutating procedure.
- In the handler: `try { … } catch (err) { if (err instanceof RecommendationDomainError) throw errors[err.code](); throw err }`. **Status only — no Swedish on the backend; the server stays i18n-free.**
- The client localizes by code via `src/lib/orpc/{recommendation,tag}ErrorMessage.ts` (type-only import of the code union, exhaustive `switch` → `m.*()`), so `isDefinedError(err)` narrows `err.code` and the create dialog can render e.g. tag `INVALID_LABEL` inline on the field.
- **Boundary/validation codes** that aren't domain codes (upload-only `INVALID_PATH`, `FILE_NOT_IN_STORAGE`) are spread into that one procedure's `.errors({ ...recommendationErrors, INVALID_PATH: { status: 403 }, FILE_NOT_IN_STORAGE: { status: 404 } })` and thrown directly (`throw errors.INVALID_PATH()`), exactly as `confirmDocumentUpload` does. These are **status-only**: the upload UI surfaces them as HTTP errors and never renders their message, so they get **no** client `*ErrorMessage` mapping — only the domain codes do.

```
src/lib/services/recommendation/   recommendation.ts, errors.ts, index.ts, recommendation.test.ts
  listRecommendations()            active rows joined to file (pathname + blurhash) + author + aggregated tags
  findRecommendation(id)
  createRecommendation(input)      one tx: file row (public, owner=author) → recommendation → recommendation_tag joins
  updateRecommendation(id, actor)  author-or-admin; replaces tag joins
  softDeleteRecommendation(id, actor)  author-or-admin; sets deleted_at, soft-deletes the file row
  RecommendationDomainError codes: NOT_FOUND | CANNOT_EDIT_OTHERS_RECOMMENDATION
                                   | CANNOT_DELETE_OTHERS_RECOMMENDATION (extend as invariants land)

src/lib/services/tag/              tag.ts, errors.ts, index.ts, tag.test.ts
  listTags()                       system + custom, for the picker
  createCustomTag(actor, label)    any authed user; trim/validate; check-first on lower(label) —
                                   idempotent: returns the existing tag on match (no ALREADY_EXISTS code)
  TagDomainError codes: INVALID_LABEL (empty / too long)

src/lib/services/file/file.ts      (the public file row is inserted inline in
                                   recommendationService.createRecommendation's tx, mirroring the
                                   avatar insert shape — extract a shared createPublicFile helper
                                   only if a second caller appears; today it would be shallow)
```

```
src/lib/orpc/procedures/recommendation.ts (+ register in router.ts)
  recommendationErrors = { …codes: { status } } satisfies Record<RecommendationDomainErrorCode, …>
  tagErrors            = { INVALID_LABEL: { status: 400 } } satisfies Record<TagDomainErrorCode, …>

  mintImageUpload  protectedProcedure                   image mime + size cap → public mint token
  create           protectedProcedure .errors({ ...recommendationErrors,
                                        INVALID_PATH, FILE_NOT_IN_STORAGE })
                                        ownership-check + storage.head (throw boundary codes) →
                                        service (catch → errors[code]()) → blurhash enqueue → publish
  list             protectedProcedure
  update           protectedProcedure .errors(recommendationErrors)  catch → errors[code]() → publish
  softDelete       protectedProcedure .errors(recommendationErrors)  catch → errors[code]() → publish
  tag.list         protectedProcedure
  tag.createCustom protectedProcedure .errors(tagErrors)  catch → errors[code]() → publish tag.changed

src/lib/orpc/recommendationErrorMessage.ts, tagErrorMessage.ts   client code → m.*() (exhaustive switch)

src/lib/queue/handlers/blurhash.ts      + 'recommendation' kind → fileService.setBlurhash(fileId, hash);
                                        skips the `if (msg.kind === 'avatar')` denormalization block
                                        (no row to denormalize to) — same as the 'document' kind
src/lib/effects/realtime/types.ts       + recommendation.changed, tag.changed
src/hooks/useRealtimeSync.ts            + dispatch arms → invalidate orpc.recommendation.key() / orpc.tag.key()
```

### Image tiers

Three sizes from one public-store original via the `unpic` transformer (`src/lib/image/transformer.ts`):

- **orb** — reuse the avatar `<Avatar>` / transformer `<img>` at ~64px (circular).
- **dialog thumbnail** — ~400px (200 @2×) in the detail dialog.
- **full** — a bounded ~2048px transform, opened on a second tap.

`file.blurhash` is the placeholder at each tier. No worker, no `thumbnailPathname`, no separate WebP. In prod the transformer routes the `*.public.blob.vercel-storage.com` URL through `/_vercel/image?url=…&w=…`; in dev it passes the raw URL through (full bytes per size — fine at this scale).

### UI surface (`src/components/recommendation/`, `src/routes/_authenticated/recommendations.tsx`)

- `RecommendationMap` — **client-only** `<Map>` from `@vis.gl/react-maplibre` (the `mounted`-guard idiom from Decision §1) with the MapTiler `mapStyle`, Lefkada `initialViewState`, Ionian `maxBounds`, `NavigationControl`. Orbs are `<Marker>`s whose content is a memoized (`React.memo`) circular thumbnail child so markers don't re-render on map pan; a tag-filter chip row narrows orbs client-side.
- `RecommendationDetailDialog` — shadcn `<Dialog>` (full-screen-ish on mobile, `sm:max-w-*` on desktop): dialog-size photo (→ full on tap), title, description, author, tag chips. Reserves space for the future like button + comments.
- `CreateRecommendationDialog` — `useAppForm` (canonical example `src/components/login/LoginFormCard.tsx`): photo upload reusing `runUploadFlow`, `TextField` title, and a multiline description (start by reusing a shadcn `<Textarea>` via `form.AppField`; promote to a bound `TextAreaField` in `src/hooks/form.ts` only if a second form needs it). The **tag picker** and **location picker** are standalone stateful components integrated via a raw `<form.AppField>` render-prop that delegates to them and pushes values with `field.handleChange(...)` — **not** crammed into a bound field, and **never** `useState` for field values (ADR-0005). The location picker is a mini MapLibre `<Map>` with one `<Marker draggable>`, pre-filled from EXIF.
- `tagLabels.ts` — a typed registry `Record<SystemTagSlug, () => string>` mapping `slug → m.tag_<slug>()`, so a missing entry is a compile error; a `<TagChip>` renders system tags through the registry and custom tags' `label` verbatim. Adding a system tag = seed migration + `m.tag_<slug>()` message + registry entry.
- `src/utils/geo.ts` — a pure `haversineKm(a, b)`; an optional "närmast mig" sort reads the browser Geolocation API and sorts the loaded orbs in JS (silently unsorted on deny).
- `src/lib/files/exif.ts` — wraps `exifr.gps(file)` → `{ lat, lng } | null`, called on the original file before the HEIC transcode (reusing the existing `isHeicCandidate`/`transcodeHeicToJpeg` helpers). `gps()` reads only the EXIF header (sub-ms), so no web worker is needed.
- Nav: a `MapPin` entry in `src/components/AppSidebar.tsx` `mainNavItems` (URL `/recommendations`; Swedish label, e.g. "Platser"); store the `m.*` function, call at render.

**Accessibility & responsive** (CLAUDE.md mandates responsive on every screen):
- *Mobile* — near-full-height map (`h-[…] md:h-[…]`, no fixed px), touch-sized `NavigationControl`, orb hit targets ≥44px; the location picker opens as a full-screen overlay rather than a cramped in-dialog map.
- *Desktop* — bounded map height; detail/create dialogs `sm:max-w-*` (existing shadcn pattern).
- *Keyboard/ARIA* — orbs are Tab-navigable and open on Enter; MapLibre `keyboard` interactions stay on; markers carry `aria-label="<place name>"`; dialogs trap focus (Radix).

### Why the new pieces are deep (and why the absent ones would be shallow)

- **`tag` service** — small interface, real hidden complexity (system/custom duality, dedup, the localization seam). Deep.
- **Map seam** — MapLibre (deep engine) + provider adapter; a one-adapter-but-reversible seam (not yet proven by a second adapter), cheap to swap by construction.
- **No photo wrapper, no thumbnail worker, no PostGIS** — each would be shallow here: delete it and complexity does not reconcentrate, because the public-store/avatar path and a one-function Haversine already cover the need.

### Marker rendering — revisit trigger

At dozens of orbs, React `<Marker>` components are fine. If recommendations ever grow to ~100+, switch the orb layer from per-marker React components to a single GeoJSON symbol layer (lower React + GPU overhead). Captured as a revisit trigger, not a v1 requirement.

---

## Consequences

**Positive**:
- Reuses four existing seams (storage, realtime, queue, service) entirely unchanged; the feature is a consumer.
- The open map engine keeps the tile provider reversible — a URL/key swap, not a rewrite.
- The photo rides the proven avatar path: one stored original, on-demand sizes, blurhash placeholder, no new worker.
- Distance is one pure, testable function; location is two ordinary columns.
- Tags grow a shared vocabulary while keeping baseline labels localized.

**Negative**:
- New client dependencies (`maplibre-gl`, `@vis.gl/react-maplibre`, `exifr`) add bundle weight.
- The map is client-only — no SSR for that view.
- `VITE_MAPTILER_API_KEY` is client-exposed; mitigated by HTTP-referrer restriction (it is not a secret).
- EXIF GPS isn't always present; mitigated by manual placement (and the location is always editable).
- The provider seam is **one-adapter, not yet proven** — it buys reversibility (a config swap), not demonstrated depth, until a second adapter lands. We accept this, as ADR-0006 accepts it for R2.

**Revisit triggers** — re-open this ADR if any of these change:

1. **Recommendations grow large, or server-side radius filtering is needed.** Adopt PostGIS `geography(Point,4326)` (Alternative A) — the columns already hold WGS84 coordinates, so the migration is additive.
2. **MapTiler's free tier is strained or its terms change.** Swap the provider (Stadia / OpenFreeMap) or self-host a Protomaps PMTiles extract in the public Blob store — engine and components unchanged.
3. **A real "private recommendations" need appears.** Add a visibility check in the service reads like every other domain rule — *not* Postgres RLS (per ADR-0010 Alternative N).
4. **EXIF reliability proves poor in practice.** Revisit the guess step (e.g. reverse-geocode hints, or default to last-used map center) — the manual fallback means this is a UX tweak, not a correctness issue.

---

## Future phases (designed, not built)

- **Likes** — `recommendation_like` (composite PK, toggle); list payload carries `likeCount` + `likedByMe`; the map premiers higher-liked orbs. Mutations publish `recommendation.changed`.
- **Comments** — `recommendation_comment` (soft-delete); a thread in the detail dialog; mutations publish `recommendation.changed`. Author-or-admin delete, like documents.

Both are additive — new tables, new thin procedures, and they reuse the **existing** `recommendation.changed` event (no new event kinds, so `useRealtimeSync` needs no extension for them) — and touch none of the first-slice decisions above.
