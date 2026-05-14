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
| Auth | Better Auth (self-hosted) — magic-link sign-in only |
| Database | Neon Postgres (added via Vercel Marketplace) |
| ORM | Drizzle |
| File storage | Cloudflare R2 |
| UI | shadcn/ui + Tailwind v4 |
| Email | Resend (for magic links) |
| Package manager | pnpm |

Primary docs reference: https://tanstack.com/start/latest

---

## Why each choice (so we don't re-debate)

### TanStack Start
Picked by the project owner up front. Single framework for frontend + server functions keeps the surface area small. Use the file-based router in `src/routes/`.

### Vercel Hobby
Easiest TanStack Start deploys, generous free tier (1M function invocations, 100 GB-Hrs duration, 100 GB transfer). The Hobby plan is technically *non-commercial*; a private boat-owners app is borderline under Vercel's fair-use rules. **Accepted risk**: if Vercel flags it, upgrade to Pro at $20/mo. Don't add commercial features (ads, paid signups) without reassessing.

### Better Auth
Free and self-hosted — no recurring auth bill. Has an official TanStack Start integration (`tanstackStartCookies` plugin, handler at `/api/auth/$`) and an **admin plugin** that ships built-in `user` / `admin` roles, ban, impersonate, session listing. Matches our two-role model with zero custom code.

Chose over Clerk: Clerk is easier but adds a vendor and a future paid tier ($25/mo above 10K MAU). At our scale we'd stay free, but the admin plugin in Better Auth is a tighter fit and there's no external dependency.

Chose over Supabase Auth: Supabase free tier *pauses projects after 7 days of inactivity*, which is exactly our usage pattern (rare logins). Cold-start on every visit after a quiet week would be visibly bad UX.

**Sign-in method: magic link only.** No passwords. Admin invites a new owner by triggering a magic link to their email. Closed group, low login frequency — passwords would just be a reset-flow tax.

### Neon Postgres
Free tier: 0.5 GB storage, 100 compute-hours/month, scale-to-zero after 5 min idle. Idle weeks cost zero compute. Postgres (not SQLite) keeps us flexible for the scheduling/file-metadata schemas. Added via Vercel Marketplace so `DATABASE_URL` auto-provisions across Preview/Production. Use the `-pooler` URL in serverless.

Over-limit behavior: compute suspends until next billing month — no surprise bill.

**Local development uses Neon Local** — Neon's docker proxy (`neondatabase/neon_local`) creates an ephemeral branch off production on `pnpm db:up` and deletes it on `pnpm db:down`. Same Postgres version, same platform behavior in dev and prod. Per-PR preview deploys also get their own Neon branch via the Vercel integration.

### Drizzle
Lightweight, TypeScript-first, small cold-start footprint on serverless. Schema lives in TypeScript (`src/lib/db/schema.ts`); migrations via `drizzle-kit`. Better Auth's most-used adapter in 2026 community.

Driver: `postgres-js` via `drizzle-orm/postgres-js`. Picked over `drizzle-orm/neon-http` because (a) Neon Local only supports the `@neondatabase/serverless` driver over HTTP, not the WebSocket Pool variant, and (b) `neon-http` lacks multi-statement transactions that Better Auth's adapter requires. `postgres-js` works identically against Neon Local and Neon cloud, with full transactions.

Chose over Prisma: Prisma is heavier in serverless (separate query engine) and uses its own `.prisma` DSL. At our scale either works; Drizzle is the lighter default.

### Cloudflare R2
10 GB free storage, 1M class-A ops/month, 10M class-B ops/month, **zero egress fees forever**. Egress is the value: owners downloading photo albums of the boat doesn't accrue bandwidth charges. S3-compatible API → browser does presigned-URL PUT directly to R2, bypassing our Vercel functions (saves function-invocation budget too).

Chose over Vercel Blob: R2 has 2× the free storage and zero egress vs Blob's 100 GB transfer cap. For an app where photos are the heaviest content, the egress story matters most.

### shadcn/ui + Tailwind v4
Copy-paste accessible components (Radix under the hood) — no runtime library to update, full code ownership. Tailwind v4 for styling. Biggest example/community pool to lift patterns from when building the scheduling and file UIs.

### Resend
Better Auth's `sendMagicLink` callback hits Resend's API. Free tier (100/day, 3K/month) is 10–100× more than we'll need. Verify a sending domain (e.g. `mail.<domain>`) for deliverability.

### pnpm
Default in the TanStack/Vercel ecosystem. Fast, disk-efficient, strict resolution catches bugs early.

---

## Environment variables

Set in Vercel project (and `.env` locally):

- `DATABASE_URL` — Neon pooled connection (auto-provisioned via Marketplace)
- `BETTER_AUTH_SECRET` — random 32+ char secret
- `BETTER_AUTH_URL` — site origin (e.g. `https://oceanview.example.com`)
- `RESEND_API_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

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
