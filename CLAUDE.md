# Oceanview

Internal web app for a sailboat co-ownership group (10–20 users: owners + a couple of admins). Not a commercial product — it coordinates one boat among its owners.

**State**: scaffold complete (auth, DB, schema, services, tests are live). Only R2 (file storage) and Resend (email delivery) remain unwired — see [Deferred work](#deferred-work).

**Planned features**: file library, contact page, boat-week scheduling. None implemented yet.

---

## Skill loading — when to load which

Load on demand, not eagerly. The `pnpm dlx @tanstack/intent` block at the bottom of this file is auto-managed; everything below is hand-curated.

| Task | Skill |
|---|---|
| Adding routes, `beforeLoad`, route guards | `@tanstack/router-core#auth-and-guards` |
| Loaders, route data, query integration | `@tanstack/router-core#data-loading` |
| Search params / path params | `@tanstack/router-core#search-params` / `#path-params` |
| Navigation, links, redirects | `@tanstack/router-core#navigation` |
| Not-found / error boundaries | `@tanstack/router-core#not-found-and-errors` |
| Type-safety questions (router context, search schemas) | `@tanstack/router-core#type-safety` |
| Server functions, SSR hydration | `@tanstack/react-start#react-start`, `#server-components` |
| Porting a Next.js example to TanStack Start | `@tanstack/react-start#lifecycle/migrate-from-nextjs` |
| Any DB schema, migration, or SQL work | project-local `neon-postgres` (at `.claude/skills/neon-postgres/`) |
| `.env` / dotenv parsing | `dotenv#dotenv` |
| Build/deploy config, Nitro server tuning | `nitro#nitro` |
| Vercel deploy, CI, rollback | `vercel:deployments-cicd`, `vercel:vercel-cli` |
| Vercel env management | `vercel:env`, `vercel:env-vars` |
| Vercel function runtime/timeout/region tuning | `vercel:vercel-functions` |
| Adding shadcn/ui components | `vercel:shadcn` |
| Reviewing React components | `vercel:react-best-practices` |
| End-to-end verification before claiming done | `vercel:verification` |

**Discovery**: `pnpm dlx @tanstack/intent@latest list` to see all intent skills; `pnpm dlx @tanstack/intent@latest load <pkg>#<skill>` to fetch one.

**Do NOT load** (don't apply to this stack): `vercel:auth` (Clerk/Auth0; we use Better Auth), `vercel:nextjs`, `vercel:next-cache-components`, `vercel:turbopack` (all Next.js-only; we run TanStack Start on Vite).

---

## Code map

```
src/
  router.tsx                       createRouter(routeTree) + devtools, error/notFound bindings
  routes/
    __root.tsx                     root layout; beforeLoad session guard (public: / and /api/auth/*)
    index.tsx                      landing / sign-in entry
    api/auth/$.ts                  Better Auth catch-all handler — delegates to auth.handler()
  lib/
    auth.ts                        betterAuth() instance: drizzleAdapter + magicLink + admin + tanstackStartCookies
    auth-client.ts                 createAuthClient() for the browser: magicLinkClient + adminClient
    get-session.ts                 server function wrapping auth.api.getSession()
    admin-allowlist.ts             isAllowlistedAdmin() + normalizeEmail() — reads ADMIN_EMAILS
    db/
      index.ts                     drizzle(postgres(DATABASE_URL)) with snake_case casing
      schema/
        better-auth.ts             CLI-regenerated; DO NOT hand-edit
        index.ts                   barrel — one re-export per feature schema
    services/
      <entity>.ts                  named exports; ALL db access lives here
      <entity>.test.ts             colocated tests using truncateAll() from test/setup.ts
  components/
    DefaultCatchBoundary.tsx       router error boundary
    NotFound.tsx                   router 404
  utils/seo.ts                     meta-tag helper
  styles/                          Tailwind v4 entry
test/
  setup.ts                         truncateAll() helper + localhost-DATABASE_URL guard
drizzle/                           generated SQL migrations
drizzle.config.ts                  schema path, output dir, Neon Local SSL workaround
compose.yaml                       Neon Local docker service (port 5432)
vite.config.ts                     TanStack Start + React + Tailwind + Nitro; vitest config
```

**Path alias**: `~/*` → `./src/*` (in `tsconfig.json`).

---

## How we write code

**Services own the database.** All `db` access lives in `src/lib/services/<entity>.ts` as named exports. Auth hooks, route handlers, and server functions call services — never `db.select()` from a route or a server function directly.

```ts
// caller
import * as userService from '~/lib/services/user'
const id = await userService.findIdByEmail(email)
```

**Adding a feature schema**: create `src/lib/db/schema/<feature>.ts`, add one re-export line to `schema/index.ts`, then `pnpm db:generate && pnpm db:migrate`. Also add the new table name to `truncateAll()` in `test/setup.ts` — there's no auto-introspection on purpose, so a forgotten table fails loudly.

**Adding a service**: create `src/lib/services/<entity>.ts` (named exports) plus colocated `<entity>.test.ts`. Tests call `truncateAll()` in `beforeEach` and run serially against Neon Local.

**Regenerating Better Auth schema**: after upgrading `better-auth` or changing plugin config in `src/lib/auth.ts`, run:
```
pnpm dlx @better-auth/cli generate --yes --output src/lib/db/schema/better-auth.ts
```
Never hand-edit `better-auth.ts`.

**Adding a guarded route**: just create the file under `src/routes/`. The root `beforeLoad` in `__root.tsx` redirects unauthenticated requests for anything not matching `/` or `/api/auth/*`.

**Input validation**: Zod v4 (already a dep). Validate at the boundary (server function args, route loaders) — trust internal call sites.

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server on :3000 |
| `pnpm build` | Vite build + `tsc --noEmit` typecheck |
| `pnpm vercel-build` | Run pending migrations, then build + typecheck (CI/deploy only) |
| `pnpm preview` | Preview built bundle |
| `pnpm start` | Run production server (`.output/server/index.mjs`) |
| `pnpm db:up` | Start Neon Local in docker (creates ephemeral branch off prod) |
| `pnpm db:down` | Stop Neon Local (deletes the ephemeral branch) |
| `pnpm db:generate` | Generate a new migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations to the active `DATABASE_URL` |
| `pnpm db:studio` | Drizzle Studio UI |
| `pnpm test` | Vitest once (serial, against Neon Local) |
| `pnpm test:watch` | Vitest watch mode |

---

## Environment variables

**Auto-provisioned by the Vercel ↔ Neon Marketplace integration** (do not add manually): `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, plus `POSTGRES_*` / `PG*` aliases.

**Local-only** (`.env`, gitignored, used by `compose.yaml`): `NEON_API_KEY`, `PARENT_BRANCH_ID`.

**Set in Vercel + `.env`**: `BETTER_AUTH_SECRET` (32+ chars; `openssl rand -base64 32`), `BETTER_AUTH_URL` (site origin), `ADMIN_EMAILS` (comma-separated allowlist).

**Manual, added when wired**: `RESEND_API_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

`.env.example` lists everything. The `vercel env pull` hazard is in [Non-negotiables](#non-negotiables).

---

## Documentation index

WebFetch these before guessing APIs. They beat the model's memorized snapshots.

- TanStack Start — https://tanstack.com/start/latest
- TanStack Router — https://tanstack.com/router/latest
- Better Auth (core) — https://www.better-auth.com/docs
- Better Auth magic-link plugin — https://www.better-auth.com/docs/plugins/magic-link
- Better Auth admin plugin — https://www.better-auth.com/docs/plugins/admin
- Better Auth TanStack Start integration — https://www.better-auth.com/docs/integrations/tanstack
- Better Auth Drizzle adapter — https://www.better-auth.com/docs/adapters/drizzle
- Drizzle ORM — https://orm.drizzle.team/docs/overview
- Drizzle Kit (migrate/generate/studio) — https://orm.drizzle.team/docs/kit-overview
- postgres-js driver — https://github.com/porsager/postgres
- Neon Postgres — https://neon.tech/docs
- Neon Local (docker proxy) — https://neon.tech/docs/local/neon-local
- Vitest — https://vitest.dev
- Zod v4 — https://zod.dev
- Tailwind v4 — https://tailwindcss.com/docs
- shadcn/ui — https://ui.shadcn.com
- Vite — https://vite.dev
- Vercel + TanStack Start — https://vercel.com/docs/frameworks/tanstack-start
- Cloudflare R2 (deferred) — https://developers.cloudflare.com/r2
- Resend (deferred) — https://resend.com/docs

---

## Deferred work

**Cloudflare R2** — not yet wired. Planned pattern: browser PUTs directly to R2 via a presigned URL minted server-side; Vercel functions never see file bytes. Postgres holds metadata only (name, folder, owner, size, mime, uploaded_at).

**Resend** — not yet wired. `sendMagicLink` in `src/lib/auth.ts:17` currently `console.log`s the URL, which is fine for local testing and the first prod sign-ins. Wire Resend once a sender domain is verified (e.g. `mail.<domain>`).

---

## Non-negotiables

- **Magic-link only.** No passwords. Don't add password sign-in without revisiting the auth design.
- **Two roles only**: `user` and `admin`. Don't introduce more without a real reason.
- **All `db` access through `src/lib/services/`.** No `db.select()` in routes, handlers, or auth hooks.
- **Never hand-edit `src/lib/db/schema/better-auth.ts`** — re-run the CLI (see [How we write code](#how-we-write-code)).
- **File blobs in R2, metadata in Postgres** (when R2 is wired). Uploads go browser → R2 directly; never proxy bytes through Vercel.
- **`vercel env pull` is dangerous**: it writes prod `DATABASE_URL` into `.env.local`, which Vite + Drizzle prefer over `.env`. If you must run it, immediately delete the `DATABASE_URL*` lines from `.env.local` — otherwise `pnpm db:migrate` would migrate **production**.
- **Migrations are explicit locally.** `pnpm build` does not migrate. `vercel-build` does, on deploy. Run `pnpm db:migrate` yourself against the local ephemeral branch.
- **Tests run only against Neon Local.** `truncateAll()` enforces this — it refuses non-localhost `DATABASE_URL`.
- **Conventional Commits** for agent commits: `<type>(<scope>): <subject>` ≤ 72 chars, imperative mood, *why* in the body. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `revert`.
- **Lock TanStack Start to a specific RC version** in `package.json` until 1.0 ships.
- **Free tier first.** Before adding any third-party service, confirm a free tier covers ~20 users.

---

## Decisions made — don't relitigate

One line each. The reasoning lives in `git log CLAUDE.md` if anyone needs it.

- **Framework**: TanStack Start (RC) — chosen by the owner up front.
- **Hosting**: Vercel Hobby — accept ToS risk for non-commercial use; upgrade to Pro if flagged.
- **Auth**: Better Auth (self-hosted) — not Clerk, not Supabase Auth, not Neon Auth.
- **Sign-in method**: magic-link only.
- **ORM**: Drizzle — not Prisma.
- **DB**: Neon Postgres + Neon Local for dev/test.
- **DB driver**: `postgres-js` — not `neon-http` (Better Auth needs multi-statement transactions; Neon Local needs the serverless driver over HTTP, which we don't use).
- **File storage**: Cloudflare R2 — not Vercel Blob (zero egress fees).
- **Email**: Resend.
- **UI**: shadcn/ui + Tailwind v4.
- **Package manager**: pnpm.

---

## Agent skill loading (@tanstack/intent)

The block below is auto-managed by `pnpm dlx @tanstack/intent@latest install` — re-run when deps change. **Do not hand-edit between the markers.**

<!-- intent-skills:start -->
## Skill Loading

Before substantial work:
- Skill check: run `pnpm dlx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->
