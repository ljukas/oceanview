# Oceanview

Internal web app for a sailboat co-ownership group (10–20 users: owners + a couple of admins). Not a commercial product — it coordinates one boat among its owners.

**State**: scaffold + auth + DB + services + file storage + email all wired. Resend in prod is gated on sender-domain verification ([Deferred work](#deferred-work)); until then prod magic-links go through `devLog` and surface in Vercel Runtime Logs.

**Architecture lives in `docs/adr/`** (ADRs 0001–0009). This file is a router: rules + commands + gotchas. For *why* a pattern exists, follow the ADR link.

---

## Skill loading — when to load which

Load on demand, not eagerly. The `pnpm dlx @tanstack/intent` block at the bottom is auto-managed; everything below is hand-curated.

| Task | Skill / Doc |
|---|---|
| Routes, `beforeLoad`, loaders, search/path params, navigation, errors | `@tanstack/router-core#*` (see intent list) |
| Server functions, SSR hydration | `@tanstack/react-start#react-start`, `#server-components` |
| DB schema, migration, SQL | project-local `neon-postgres` (`.claude/skills/neon-postgres/`) for Neon-specific work; `supabase-postgres-best-practices` for general Postgres design / query / index best practices |
| Build/deploy, Nitro tuning | `nitro#nitro`, `vercel:deployments-cicd`, `vercel:vercel-cli` |
| Vercel env management | `vercel:env`, `vercel:env-vars` |
| Vercel function runtime/timeout/region | `vercel:vercel-functions` |
| shadcn/ui components + theming | `vercel:shadcn` + project-local `shadcn` (`.claude/skills/shadcn/`) |
| Forms (composition, bound fields, validation) | `docs/adr/0005-form-architecture.md` |
| Services, domain rules, error mapping | `docs/adr/0002-service-domain-architecture.md` |
| Side effects (email, storage, audit) | `docs/adr/0001-side-effects-architecture.md` |
| Email templates | `docs/adr/0008-email-architecture.md` + https://react.email/docs |
| Background jobs, queue topics | `docs/adr/0007-background-job-queue-architecture.md` |
| Realtime sync (publish events, SSE) | `docs/adr/0004-realtime-sync-architecture.md` |
| Logging | `docs/adr/0003-logging-architecture.md` |
| File storage (avatars, documents) | `docs/adr/0006-file-storage.md` |
| Organization rules (social invariants the schema can't express) | `docs/adr/0009-organization-rules.md` |
| Reviewing React components | `vercel:react-best-practices` |
| End-to-end verification | `vercel:verification` |
| oRPC: core / Better Auth / TanStack Query / SSR | https://orpc.dev/docs (+ `/integrations/*`, `/best-practices/optimize-ssr`) |
| Biome | `biome.json` + https://biomejs.dev/reference/configuration/ |

**Discovery**: `pnpm dlx @tanstack/intent@latest list` → all intent skills; `… load <pkg>#<skill>` to fetch one.

**Do NOT load** (wrong stack): `vercel:auth` (we use Better Auth), `vercel:nextjs`, `vercel:next-cache-components`, `vercel:turbopack` (we use TanStack Start on Vite).

---

## Code map

```
src/
  router.tsx                    createRouter + devtools + error/notFound bindings
  routeTree.gen.ts              codegen — DO NOT hand-edit
  routes/
    __root.tsx                  root layout; session guard (public: /, /api/auth/*)
    login.tsx                   magic-link + passkey sign-in
    api/auth/$.ts               Better Auth catch-all
    api/rpc/$.ts                oRPC catch-all
    api/files/download.$id.ts   auth-gated 302 → signed storage URL
    _authenticated.tsx          pathless guard → /login
    _authenticated/             index, contacts, documents, konto, admin/{users,shares}
  lib/
    auth.ts                     betterAuth(): drizzleAdapter + passkey + magicLink + admin
    authClient.ts               createAuthClient() for the browser
    getSession.ts               server fn wrapping auth.api.getSession()
    adminAllowlist.ts           isAllowlistedAdmin() reading ADMIN_EMAILS
    zodLocale.ts                z.config(z.locales.sv()) — imported from router.tsx
    passkeyProviders.ts         AAGUID → provider lookup
    utils.ts                    cn() + tiny helpers
    orpc/
      context.ts                base / public / protected / admin procedures
      router.ts                 appRouter; SERVER-ONLY
      client.ts                 isomorphic client + TanStack Query utils
      procedures/               health, user, image, file, share
    db/
      index.ts                  drizzle(postgres(DATABASE_URL)), snake_case
      schema/
        betterAuth.ts           CLI-regenerated; DO NOT hand-edit
        index.ts                barrel
    services/                   per-entity folders (user, season, share, file)
                                each: <entity>.ts, errors.ts (when invariants), .test.ts, index.ts barrel
                                see ADR-0002
    effects/                    cross-system adapters; see ADR-0001
      email/                    adapters: smtp (dev), resend (prod), devLog (test); see ADR-0008
      storage/                  adapters: vercelBlob (prod), s3 (dev RustFS), devLog;
                                clientUpload.ts dispatches on upload.kind; see ADR-0006
      index.ts                  barrel
    logger/                     pino on server, console+POST /api/log in browser
                                use context.log in oRPC; logger singleton elsewhere
                                see ADR-0003
  hooks/                        useMobile, usePasskeys, useSavedLogin, form
  components/
    {DefaultCatchBoundary,NotFound,AppSidebar,ModeToggle,ThemeProvider}.tsx
    user/  passkey/  document/  contact/  share/  form/  ui/
  emails/                       React Email templates; preview with `pnpm email:dev`
  data/passkeyAaguids.json      static AAGUID registry
  utils/seo.ts                  meta-tag helper
  styles/                       Tailwind v4 entry
test/
  setup.ts                      schema-per-test (CREATE/DROP); localhost guard
  scope.ts                      newScope() — per-test prefixed IDs/emails
drizzle/                        generated SQL migrations
drizzle.config.ts               Neon Local SSL workaround
compose.yaml                    db, queue, mail, storage services
vite.config.ts                  TanStack Start + Nitro; vitest config
```

**Path alias**: `~/*` → `./src/*` (`tsconfig.json`).

---

## How we write code

Five architectural rules (full rationale in each ADR — read it before adjusting the pattern):

- **Services own DB access and domain rules.** All `db` access through `src/lib/services/<entity>/`. Invariants live in guarded ops (`updateAsAdmin`, …) and surface as `<Entity>DomainError` with discriminating English `code` union. Procedures map to Swedish `ORPCError`. See **ADR-0002**.
- **Cross-system effects in `src/lib/effects/`.** Services never import Better Auth / Vercel Blob / Resend. Effect adapters run *after* a successful service call. See **ADR-0001**.
- **Logging via `~/lib/logger/`.** `context.log` in oRPC procedures; `logger` singleton elsewhere. Never `console.*`. See **ADR-0003**.
- **Realtime sync via `realtime.publish(...)`.** Procedures publish `<namespace>.changed`; one `useRealtimeSync()` per tab invalidates `orpc.<namespace>` queries. See **ADR-0004**.
- **Forms via `useAppForm`.** Never `useState` for field values. Field errors via bound `<FieldError>`; async errors via `toast.error()`. Canonical example: `src/components/login/LoginFormCard.tsx`. See **ADR-0005**.

### Workflow recipes

**Adding a feature schema**: create `src/lib/db/schema/<feature>.ts` → add re-export to `schema/index.ts` → `pnpm db:generate --name=<descriptive_name> && pnpm db:migrate`. Test setup runs all migrations per-test, so nothing in `test/setup.ts` needs touching.

**Name migrations descriptively.** Always pass `--name=` to `pnpm db:generate` — without it drizzle-kit emits `0003_small_jetstream.sql`. For data-only migrations: `pnpm drizzle-kit generate --custom --name=<name>`. To rename pre-prod: update both the filename and `tag` in `drizzle/meta/_journal.json` together.

**Adding a service**: copy `services/user/` shape — `<entity>.ts`, `<entity>.test.ts` (`setupDatabase()` first), `index.ts` barrel. Add `errors.ts` only when an invariant lands. See ADR-0002.

**Adding an effect**: copy `effects/email/` shape — `<domain>.ts` (interface + adapter selector), `adapters/<name>.ts` (one per implementation), `index.ts` barrel, `<domain>.test.ts`. Register in `effects/index.ts`. See ADR-0001.

**Adding an oRPC procedure**: edit `src/lib/orpc/procedures/<entity>.ts`. Pick `publicProcedure` / `protectedProcedure` / `adminProcedure` (never inline auth). `.input(zodSchema)`. **Handlers are thin glue**: parse → service → catch `<Entity>DomainError` → rethrow as Swedish `ORPCError` → run side effects after success. Export and register in `orpc/router.ts`.

**Loaders + mutations**: `loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(orpc.x.y.queryOptions())`, read with `useSuspenseQuery`. Mutations via `orpc.x.create.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.x.list.queryKey() }) })`. Use `.key()` for bulk invalidation. Narrow errors with `isDefinedError(err)`.

**Regenerating Better Auth schema**: `pnpm auth:schema`. Idempotent; runs the CLI then `scripts/patchBetterAuthSchema.mjs` to add `{ withTimezone: true }` to every `timestamp(...)` (CLI doesn't support `timestamptz`). Never hand-edit `betterAuth.ts`.

**Adding a guarded route**: file under `src/routes/_authenticated/`. Login route stays at `src/routes/login.tsx` (public).

**Component placement**: feature components in `src/components/<entity>/<Component>.tsx` (entity-singular: `user/`, `passkey/`). Top-level `src/components/*.tsx` reserved for app-wide chrome. Skip TanStack's `-components/` convention.

**Adding a UI component**: `pnpm dlx shadcn@latest add <name>` (writes into `src/components/ui/`). Follow `.claude/skills/shadcn/SKILL.md` — semantic colors only, `gap-*` not `space-y-*`, `size-*` for equal dimensions.

**Input validation**: Zod v4 at the boundary (`.input(...)`, server function args, route loaders). Swedish error messages come from `z.config(z.locales.sv())` in `src/lib/zodLocale.ts` — only override per-field for wording tighter than the locale default.

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server on :14500 |
| `pnpm dev:log` | `dev` with stdout+stderr teed to `/tmp/oceanview-dev.log` |
| `pnpm build` | Vite build + `tsc --noEmit` |
| `pnpm vercel-build` | Migrate then build (CI/deploy only) |
| `pnpm preview` / `pnpm start` | Preview built bundle / run prod server |
| `pnpm dev:up` / `dev:down` | Whole dev stack: db + queue + mail + storage; `up` also runs migrations |
| `pnpm db:{up,down,generate,migrate,studio}` | Neon Local on :14520; generate / apply migrations; Drizzle Studio |
| `pnpm auth:schema` | Regenerate `betterAuth.ts` + patch `timestamptz`. Idempotent |
| `pnpm queue:{up,down,studio}` | Redis broker :14521; Bull Studio :14504 (needs `queue:up`) |
| `pnpm storage:{up,down}` | RustFS S3 on :14523 + console :14503 + bucket bootstrap |
| `pnpm mail:{up,down}` | Mailpit SMTP :14522 + UI :14502 |
| `pnpm email:dev` | React Email preview server on :14501 |
| `pnpm dev:worker` | Local BullMQ worker (consumes `blurhash` topic) |
| `pnpm test` / `test:watch` | Vitest; per-test schema (CREATE/migrate/DROP) on Neon Local session-pool URL |
| `pnpm check` | Biome format + lint + organize imports (writes). Daily driver |
| `pnpm check:unsafe` / `check:ci` | Unsafe fixes (Tailwind sort); dry-run for CI |
| `pnpm {format,lint,lint:fix}` | Biome subsets |

---

## Environment variables

`.env.example` lists everything. Categories:

- **Auto-provisioned by Vercel ↔ Neon Marketplace** (do not add manually): `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, plus `POSTGRES_*` / `PG*` aliases.
- **Local-only for Neon Local** (`.env`, gitignored): `NEON_API_KEY`, `PARENT_BRANCH_ID`.
- **Set in Vercel + `.env`**: `BETTER_AUTH_SECRET` (32+ chars; `openssl rand -base64 32`), `BETTER_AUTH_URL`, `ADMIN_EMAILS` (CSV allowlist).
- **Vercel Blob (auto-provisioned via Marketplace)**: `BLOB_PUBLIC_READ_WRITE_TOKEN` (avatars), `BLOB_PRIVATE_READ_WRITE_TOKEN` (documents). Leave blank locally; use `S3_*` instead. Override: `STORAGE_ADAPTER=devLog` (tests).
- **Local S3** (backs `pnpm storage:up`): `S3_ENDPOINT` (default `http://localhost:14523`), `S3_REGION=eu-north-1`, `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` (default `oceanview-dev`/`oceanview-dev-secret-key`), `S3_BUCKET_PUBLIC=oceanview-public`, `S3_BUCKET_PRIVATE=oceanview-private`. When `S3_ENDPOINT` is set, the storage adapter picks `s3` over `BLOB_*`. See ADR-0006.
- **Resend (after DNS verification)**: `RESEND_API_KEY`, `EMAIL_FROM`. Activates when `RESEND_API_KEY` is set and `SMTP_HOST` is unset. Until then, prod runs through `devLog`. See ADR-0008.
- **Local SMTP (Mailpit)**: `SMTP_HOST=localhost`, `SMTP_PORT=14522`, `EMAIL_FROM`. When set, takes precedence over `RESEND_API_KEY` so `vercel env pull` accidents don't send real mail. Override: `EMAIL_ADAPTER=devLog`. See ADR-0008.
- **Optional**: `LOG_LEVEL` (pino; defaults: `debug` dev, `info` prod). `REDIS_URL` enables BullMQ locally.

`vercel env pull` hazard — see [Non-negotiables](#non-negotiables).

---

## Documentation index

WebFetch before guessing APIs.

- TanStack Start / Router / Form / Query — `tanstack.com/{start,router,form,query}/latest`
- Better Auth — `better-auth.com/docs` (+ `/plugins/{magic-link,admin,passkey}`, `/integrations/tanstack`, `/adapters/drizzle`)
- Drizzle / Drizzle Kit — `orm.drizzle.team/docs/overview`, `/kit-overview`
- postgres-js — `github.com/porsager/postgres`
- Neon / Neon Local — `neon.tech/docs`, `/local/neon-local`
- Vitest — `vitest.dev`
- Zod v4 — `zod.dev`
- Tailwind v4 — `tailwindcss.com/docs`
- shadcn/ui (+ theming + TanStack Form integration) — `ui.shadcn.com`
- oRPC — `orpc.dev/docs` (+ `/adapters/tanstack-start`, `/integrations/{better-auth,tanstack-query}`, `/best-practices/optimize-ssr`)
- next-themes — `github.com/pacocoursey/next-themes`
- Vite — `vite.dev`
- Vercel + TanStack Start — `vercel.com/docs/frameworks/tanstack-start`
- Vercel Blob — `vercel.com/docs/vercel-blob`
- Cloudflare R2 (documented fallback per ADR-0006) — `developers.cloudflare.com/r2`
- React Email + Resend + Nodemailer + Mailpit — `react.email/docs`, `resend.com/docs`, `nodemailer.com/about/`, `mailpit.axllent.org/docs/`

---

## Deferred work

**Resend sender domain** — `resend` adapter ships in `src/lib/effects/email/adapters/resend.ts`, gated on `RESEND_API_KEY` + `EMAIL_FROM` set in Vercel (and `SMTP_HOST` unset — the prod default). Pending DNS for `mail.<oceanview-domain>` (SPF/DKIM/return-path). Drop values into Vercel envs once verified — no code change. Until then, prod magic-links go through `devLog` and appear in Vercel Runtime Logs. See ADR-0008.

---

## Non-negotiables

- **Magic-link only.** No passwords without revisiting auth design.
- **Two roles**: `user` and `admin`. Don't introduce more without a real reason.
- **All `db` access through services.** No `db.select()` in routes/handlers/auth hooks. See ADR-0002.
- **oRPC procedures are thin glue.** Gate with `protectedProcedure`/`adminProcedure` (never inline). Better Auth's own routes (`/api/auth/*`) stay on the Better Auth handler.
- **All logging through `~/lib/logger/`.** Never `console.*` directly. See ADR-0003.
- **Never hand-edit `src/lib/db/schema/betterAuth.ts`** — re-run `pnpm auth:schema`.
- **All timestamp columns use `timestamp({ withTimezone: true })`.** Better Auth's schema is patched by `pnpm auth:schema`. When drizzle-kit emits `SET DATA TYPE timestamp with time zone`, hand-add `USING "<col>" AT TIME ZONE 'UTC'` to each ALTER before applying (existing values would otherwise be reinterpreted in the session TZ). Reference: `drizzle/0006_use_timestamptz.sql`.
- **File blobs out-of-process.** Browser → storage directly; bytes never traverse a Vercel Function. `oceanview-public` (avatars) + `oceanview-private` (documents). All file code goes through `src/lib/effects/storage/`. See ADR-0006.
- **`vercel env pull` is dangerous**: writes prod `DATABASE_URL` into `.env.local`, which Vite + Drizzle prefer over `.env`. If you must run it, immediately delete the `DATABASE_URL*` lines from `.env.local` — otherwise `pnpm db:migrate` migrates **production**.
- **Migrations are explicit locally outside `pnpm dev:up`.** `dev:up` auto-runs `db:migrate`; `db:up`, `build`, ad-hoc flows do not. `vercel-build` migrates on deploy.
- **File naming.**
  - Routes (`src/routes/`) follow [TanStack file-naming](https://tanstack.com/router/latest/docs/routing/file-naming-conventions): lowercase + tokens (`__root`, `_authenticated`, `$id`, `index`).
  - React components: **PascalCase** matching the export. Feature components in `src/components/<entity>/`; top-level reserved for app-wide chrome.
  - Hooks: **camelCase** with `use` prefix.
  - Everything else (lib / utils / data / config): **camelCase**.
  - `src/components/ui/` is **kebab-case**, CLI-managed by shadcn — don't normalize.
  - Directory roles: `lib/` = wired/stateful; `hooks/` = React hooks; `utils/` = pure helpers; `data/` = static.
- **Conventional Commits**: `<type>(<scope>): <subject>` ≤ 72 chars, imperative, *why* in body. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `revert`.
- **Lock TanStack Start to a specific RC version** in `package.json` until 1.0.
- **Free tier first.** Confirm any third-party service covers ~20 users on a free tier.
- **Every screen must be responsive.** Desktop + mobile + tablet; use Tailwind responsive utilities + shadcn primitives; no fixed pixel widths.
- **User-facing text is Swedish, informal "du".** "Oceanview" stays untranslated. Code identifiers, comments, logs, commits, DB enum values stay English. `<html lang="sv">` in `__root.tsx`.

---

## Decisions made — don't relitigate

One line each. Reasoning in `git log CLAUDE.md` and in the linked ADR.

- **Framework**: TanStack Start (RC, locked) on Vite.
- **Hosting**: Vercel Hobby (non-commercial). Stockholm region (`arn1` / `eu-north-1`).
- **Auth**: Better Auth (self-hosted), magic-link only, two roles.
- **DB**: Neon Postgres + Neon Local; `postgres-js` driver (Better Auth needs multi-statement tx).
- **ORM**: Drizzle.
- **Data layer**: oRPC + TanStack Query; SSR via `createRouterClient` in-process. See ADR-0002.
- **Domain rules in services**; procedures map `<Entity>DomainError` → Swedish `ORPCError`. See ADR-0002.
- **Side effects in `src/lib/effects/`** with three-tier execution model. See ADR-0001.
- **Logging**: pino → stdout → Vercel Runtime Logs; browser warn/error POSTs `/api/log`. See ADR-0003.
- **Realtime sync**: SSE + in-process pub/sub; single-instance assumption. See ADR-0004.
- **Forms**: `@tanstack/react-form` v1 `createFormHook` + bound shadcn `<Field>`. See ADR-0005.
- **File storage**: Vercel Blob (prod) / RustFS (dev) / devLog (test); two stores, two oRPC routers, discriminated `upload.kind`. R2 documented as swap-in. See ADR-0006.
- **Background jobs**: Vercel Queues (prod) / BullMQ + Redis (dev) / devLog (test); shared handler. See ADR-0007.
- **Email**: Resend (prod) / Mailpit SMTP (dev) / devLog (test); magic-link is tier-1 sync; React Email templates. See ADR-0008.
- **All timestamps `timestamptz`** (2026-05-26). Migration `0006_use_timestamptz.sql`; Better Auth patched via `pnpm auth:schema`.
- **DB-enforced invariants via CHECK constraints** (2026-05-26). Physical truths only (sizes, week numbers, part numbers, range bounds); domain rules still in services.
- **Admin assigns ownership in whole-share pairs by default; split via toggle** (2026-05-26). 10-card grid at `/admin/shares`; `assignShareAsAdmin`/`unassignShareAsAdmin` wrap both halves in one tx; `src/lib/shares/collapse.ts` collapses full pairs to `A`, lone halves to `A1`/`A2`; mutations publish `share.changed`.
- **Assignment events are first-class** (2026-05-27). `ownership_assignment_event` parent table groups sibling per-part rows so history collapses to one entry per admin decision; no `kind` column on the parent (computed from children — drift-free). See ADR-0002 patterns; see also ADR-0009 for the new whole-share rule enforced alongside.
- **Organization rules live in ADR-0009** (2026-05-27). Social rules the schema can't express (e.g. "every owner holds at least one whole share") are documented there and enforced as typed `<Entity>DomainError` raised pre-commit by services. New rules append to that ADR.
- **UI**: shadcn/ui (style `radix-nova`, base `slate`) + Tailwind v4. CSS vars in `src/styles/app.css`; `components.json` source of truth.
- **Dark mode**: `next-themes` with `attribute="class"` + system + manual toggle; no FOUC.
- **Package manager**: pnpm.
- **Linter/formatter**: Biome (editor-only, no CI gate); Tailwind class sorting on; CSS skipped (Tailwind v4 directives unsupported).
- **Sidebar breakpoints**: drawer <1024px, icon-rail 1024–1279px, full ≥1280px. `MOBILE_BREAKPOINT` in `src/hooks/useMobile.ts`. Sidebar primitive consumes it; pages step at `md:`. Icon-rail tooltips are the canonical exception to the "skip tooltips on self-evident icons" rule.

---

## Agent skill loading (@tanstack/intent)

The block below is auto-managed by `pnpm dlx @tanstack/intent@latest install`. **Do not hand-edit between the markers.**

<!-- intent-skills:start -->
## Skill Loading

Before substantial work:
- Skill check: run `pnpm dlx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->
