# Oceanview

Internal web app for a sailboat co-ownership group. 10–20 users total (owners + a couple of admins). Not a commercial product — purpose is to coordinate one boat among its owners.

## Planned features

1. **File library** — upload/download, organized by folders/categories. Stores docs, manuals, photos.
2. **Contact page** — name, email, phone for each owner.
3. **Boat-week scheduling** — assign owners to weeks of the year.

None are implemented yet. This file captures the stack and the reasoning so future sessions don't re-litigate decisions.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | TanStack Start (RC, May 2026) |
| Hosting | Vercel Hobby |
| Auth | Neon Auth (built on Better Auth 1.4.18, managed) — magic-link sign-in only |
| Database | Neon Postgres (added via Vercel Marketplace) |
| ORM | Drizzle |
| File storage | Cloudflare R2 |
| UI | shadcn/ui + Tailwind v4 |
| Package manager | pnpm |

Primary docs reference: https://tanstack.com/start/latest

---

## Why each choice (so we don't re-debate)

### TanStack Start
Picked by the project owner up front. Single framework for frontend + server functions keeps the surface area small. Use the file-based router in `src/routes/`.

### Vercel Hobby
Easiest TanStack Start deploys, generous free tier (1M function invocations, 100 GB-Hrs duration, 100 GB transfer). The Hobby plan is technically *non-commercial*; a private boat-owners app is borderline under Vercel's fair-use rules. **Accepted risk**: if Vercel flags it, upgrade to Pro at $20/mo. Don't add commercial features (ads, paid signups) without reassessing.

### Neon Auth
Managed auth service built on Better Auth 1.4.18, with identity stored in the `neon_auth` schema of our Neon database (already auto-provisioned by the Vercel Marketplace integration). Same Better Auth API surface, same plugin ecosystem — but Neon hosts the auth server and handles email delivery.

Free tier: **60,000 MAU** — three orders of magnitude above our ceiling.

**Plugins we rely on:**
- **Magic Link** — `authClient.signIn.magicLink({ email, callbackURL })`. Neon sends the email by default; we can subscribe to the `send.magic_link` webhook later if we want custom branding.
- **Admin** (Beta) — built-in `admin` / user role distinction, ban, impersonate, session listing. Matches our two-role model with zero custom schema.

Chose over self-hosted Better Auth: same engine, but Neon Auth removes the auth-server ops (secrets, key rotation, email sender wiring). Vendor coupling is acceptable since we're already locked to Neon for the database — adding Neon Auth doesn't introduce *new* vendor risk.

Chose over Clerk: Clerk is another vendor and trends paid above 10K MAU. We're already on Neon for the DB; using Neon Auth keeps the dependency surface at one provider for auth + data.

Chose over Supabase Auth: Supabase free tier *pauses projects after 7 days of inactivity*, which exactly matches our usage pattern. Neon scales-to-zero per-branch but resumes in milliseconds.

**Sign-in method: magic link only.** No passwords. Admin invites a new owner by triggering a magic link to their email. Disable other sign-in methods in the Neon Console → Auth → Plugins panel.

**TanStack Start caveat:** Neon Auth's official quick-start covers TanStack Router, not TanStack Start (SSR). Since Neon Auth is Better Auth under the hood, the Better Auth `tanstackStartCookies` plugin + `/api/auth/$` handler pattern should apply — to be confirmed when we implement.

### Neon Postgres
Free tier: 0.5 GB storage, 100 compute-hours/month, scale-to-zero after 5 min idle. Idle weeks cost zero compute. Postgres (not SQLite) keeps us flexible for the scheduling/file-metadata schemas. Added via Vercel Marketplace so `DATABASE_URL` auto-provisions across Preview/Production. Use the `-pooler` URL in serverless.

Over-limit behavior: compute suspends until next billing month — no surprise bill.

**Local development uses Neon Local** — Neon's docker proxy (`neondatabase/neon_local`) creates an ephemeral branch off production on `pnpm db:up` and deletes it on `pnpm db:down`. Same Postgres version, same platform behavior in dev and prod. Per-PR preview deploys also get their own Neon branch via the Vercel integration.

### Drizzle
Lightweight, TypeScript-first, small cold-start footprint on serverless. Schema lives in TypeScript (`src/lib/db/schema.ts`); migrations via `drizzle-kit`. Neon Auth owns the `neon_auth` schema directly — Drizzle only manages app-owned tables under `public`.

Driver: `postgres-js` via `drizzle-orm/postgres-js`. Picked over `drizzle-orm/neon-http` because (a) Neon Local only supports the `@neondatabase/serverless` driver over HTTP, not the WebSocket Pool variant, and (b) `neon-http` lacks multi-statement transactions. `postgres-js` works identically against Neon Local and Neon cloud, with full transactions.

Chose over Prisma: Prisma is heavier in serverless (separate query engine) and uses its own `.prisma` DSL. At our scale either works; Drizzle is the lighter default.

### Cloudflare R2
10 GB free storage, 1M class-A ops/month, 10M class-B ops/month, **zero egress fees forever**. Egress is the value: owners downloading photo albums of the boat doesn't accrue bandwidth charges. S3-compatible API → browser does presigned-URL PUT directly to R2, bypassing our Vercel functions (saves function-invocation budget too).

Chose over Vercel Blob: R2 has 2× the free storage and zero egress vs Blob's 100 GB transfer cap. For an app where photos are the heaviest content, the egress story matters most.

### shadcn/ui + Tailwind v4
Copy-paste accessible components (Radix under the hood) — no runtime library to update, full code ownership. Tailwind v4 for styling. Biggest example/community pool to lift patterns from when building the scheduling and file UIs.

### pnpm
Default in the TanStack/Vercel ecosystem. Fast, disk-efficient, strict resolution catches bugs early.

---

## Environment variables

All Neon-related vars below are **auto-provisioned by the Vercel Marketplace integration** for Production / Preview / Development. R2 vars are manual additions when we wire up file storage.

Auto-provisioned (don't add manually):
- `DATABASE_URL` — Neon pooled connection
- `DATABASE_URL_UNPOOLED` — direct connection, used for migrations
- `NEON_AUTH_BASE_URL` — server-side Neon Auth endpoint
- `VITE_NEON_AUTH_URL` — client-side Neon Auth endpoint (exposed to browser via Vite's `VITE_` prefix)
- `NEON_PROJECT_ID`, plus various `POSTGRES_*` / `PG*` aliases — used by some tooling

Local-only (in `.env`, gitignored):
- `NEON_API_KEY` — personal Neon API key for the Neon Local docker container (create at https://console.neon.tech/app/settings/api-keys)
- `PARENT_BRANCH_ID` — production branch ID, parent for our ephemeral local branches

Manual (will be added when we wire up R2):
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`

---

## Conventions

- Two roles only: `user` (owner) and `admin`. Don't introduce more without a real reason.
- File blobs live in R2; their metadata (name, folder, owner, size, mime, uploaded_at) lives in Postgres.
- Uploads go browser → R2 directly via presigned URL. Don't proxy file bytes through Vercel functions.
- Magic-link only — don't add password sign-in without revisiting the auth design.
- Always lock TanStack Start to a specific RC version in `package.json` until 1.0 ships.
- Before adding any new third-party service: confirm there's a free tier sufficient for ~20 users.
- **Don't run `vercel env pull` locally without thinking**: it pulls prod-tier `DATABASE_URL` and `DATABASE_URL_UNPOOLED` into `.env.local`, which Vite + Drizzle will prefer over the Neon Local pointer in `.env`. Running `pnpm db:migrate` after such a pull would migrate **production**, not the ephemeral branch. If you must pull, delete `.env.local` (or at least the `DATABASE_URL*` lines) before any DB command.
- Migrations apply automatically on Vercel deploy via the `vercel-build` script. Local `pnpm build` does *not* run migrations — use `pnpm db:migrate` explicitly when you want to apply pending migrations to the local ephemeral branch.
- **Agent commits follow [Conventional Commits](https://www.conventionalcommits.org)**: `<type>(<scope>): <subject>` with optional scope. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `revert`. Keep the subject ≤ 72 chars and in the imperative mood. Use the body to explain *why*; the diff shows *what*.
