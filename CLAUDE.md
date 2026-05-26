# Oceanview

Internal web app for a sailboat co-ownership group (10–20 users: owners + a couple of admins). Not a commercial product — it coordinates one boat among its owners.

**State**: scaffold complete (auth, DB, schema, services, tests are live). File storage (Vercel Blob) is wired — avatars + documents. Email is wired — Mailpit in dev, Resend stubbed for prod (activates once the sender domain is verified — see [Deferred work](#deferred-work)).

**Planned features**: boat-week scheduling. None implemented yet.

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
| Adding shadcn/ui components | `vercel:shadcn` + project-local `shadcn` (at `.claude/skills/shadcn/`) |
| Theming / CSS vars / dark mode tweaks | project-local `shadcn#customization.md` |
| Building or editing forms (composition, bound fields, validation, accessibility) | `docs/adr/0005-form-architecture.md` |
| Reviewing React components | `vercel:react-best-practices` |
| End-to-end verification before claiming done | `vercel:verification` |
| Adding oRPC procedures, middleware, error handling | https://orpc.dev/docs |
| Adding services, domain rules, error mapping | `docs/adr/0002-service-domain-architecture.md` |
| Adding side effects (email, storage, audit, …) | `docs/adr/0001-side-effects-architecture.md` |
| Adding or editing email templates (React Email components, `renderMagicLink` helpers) | `docs/adr/0008-email-architecture.md` + https://react.email/docs |
| Adding a queue topic, worker, broker config, or background-job handler | `docs/adr/0007-background-job-queue-architecture.md` |
| Adding realtime sync (publish events, new event kinds, SSE/subscriber behaviour) | `docs/adr/0004-realtime-sync-architecture.md` |
| Adding logging — significant events, error sinks, request-scoped context | `docs/adr/0003-logging-architecture.md` |
| Wiring oRPC into Better Auth | https://orpc.dev/docs/integrations/better-auth |
| oRPC + TanStack Query (`queryOptions`, `mutationOptions`, invalidation) | https://orpc.dev/docs/integrations/tanstack-query |
| SSR optimization for oRPC (`createRouterClient`, serializer) | https://orpc.dev/docs/best-practices/optimize-ssr |
| Biome config, lint rules, formatter | `biome.json` + https://biomejs.dev/reference/configuration/ |

**Discovery**: `pnpm dlx @tanstack/intent@latest list` to see all intent skills; `pnpm dlx @tanstack/intent@latest load <pkg>#<skill>` to fetch one.

**Do NOT load** (don't apply to this stack): `vercel:auth` (Clerk/Auth0; we use Better Auth), `vercel:nextjs`, `vercel:next-cache-components`, `vercel:turbopack` (all Next.js-only; we run TanStack Start on Vite).

---

## Code map

```
src/
  router.tsx                       createRouter(routeTree) + devtools, error/notFound bindings
  routeTree.gen.ts                 TanStack Router codegen — DO NOT hand-edit
  routes/
    __root.tsx                     root layout; beforeLoad session guard (public: / and /api/auth/*)
    login.tsx                      magic-link + passkey sign-in
    api/auth/$.ts                  Better Auth catch-all — delegates to auth.handler()
    api/rpc/$.ts                   oRPC catch-all — mounts appRouter at /api/rpc
    api/files/download.$id.ts      auth-gated → 302 redirect to signed storage URL for a document
    _authenticated.tsx             pathless guard: redirects unauthed → /login
    _authenticated/
      index.tsx                    dashboard / home
      contacts.tsx                 contacts page (placeholder)
      documents.tsx                shared file library — DocumentUpload + DocumentList (private store)
      konto.tsx                    user's own account + passkey management
      admin.tsx                    admin landing
      admin/users.tsx              admin user CRUD
  lib/
    auth.ts                        betterAuth() instance: drizzleAdapter + passkey + magicLink + admin + tanstackStartCookies
    authClient.ts                  createAuthClient() for the browser: passkeyClient + magicLinkClient + adminClient
    getSession.ts                  server function wrapping auth.api.getSession() (used by route beforeLoad)
    adminAllowlist.ts              isAllowlistedAdmin() + normalizeEmail() — reads ADMIN_EMAILS
    zodLocale.ts                   z.config(z.locales.sv()) — imported once from src/router.tsx
    passkeyProviders.ts            getPasskeyProvider() lookup against `~/data/passkeyAaguids.json`
    utils.ts                       cn() and other tiny helpers
    orpc/
      context.ts                   base / publicProcedure / protectedProcedure / adminProcedure + Better Auth middleware
      router.ts                    appRouter — composes per-entity routers; SERVER-ONLY
      client.ts                    isomorphic client (createRouterClient on server, RPCLink on browser) + `orpc` TanStack Query utils
      procedures/
        health.ts                  liveness probe
        user.ts                    thin handlers: parse → service → map UserDomainError → cross-system side effects (auth.api.revokeUserSessions on delete)
        image.ts                   imageRouter (public store): mintAvatarUpload + confirmAvatarUpload — updates user.image
        file.ts                    fileRouter (private store): mintDocumentUpload + confirmDocumentUpload + listDocuments + deleteDocument
    db/
      index.ts                     drizzle(postgres(DATABASE_URL)) with snake_case casing
      schema/
        betterAuth.ts              CLI-regenerated; DO NOT hand-edit
        index.ts                   barrel — one re-export per feature schema
    services/                      one folder per entity; barrel `index.ts` re-exports the public surface
      user/
        index.ts                   re-exports from ./user and ./errors
        user.ts                    user data access + admin-CRUD invariants (LAST_ADMIN, CANNOT_ACT_ON_SELF, …)
        errors.ts                  UserDomainError + discriminating `code` union — mapped to ORPCError by procedures
        user.test.ts               colocated; fresh schema-per-test from test/setup.ts; exercises invariants through the service interface
      season/
        index.ts                   re-exports from ./season
        season.ts                  season CRUD + schedule grid
        season.test.ts             DB-touching tests
        logic.test.ts              pure date / share-rotation math tests (no DB)
      share/
        index.ts                   re-exports from ./share
        share.ts                   share-part data access + assignment transactions
        share.test.ts              colocated tests
      file/
        index.ts                   re-exports from ./file and ./errors
        file.ts                    file metadata CRUD + owner/admin invariants for delete
        errors.ts                  FileDomainError + discriminating `code` union
        file.test.ts               colocated tests
    effects/                       cross-system side-effect adapters; see docs/adr/0001
      email/
        email.ts                   EmailEffects interface + lazy-import adapter selector (VITEST/EMAIL_ADAPTER override → SMTP_HOST → RESEND_API_KEY → devLog)
        adapters/smtp.ts           nodemailer SMTP — local dev (Mailpit); ONLY file that imports nodemailer
        adapters/resend.ts         Resend SDK — production; ONLY file that imports resend
        adapters/devLog.ts         test/offline adapter — logs to the structured logger
        index.ts                   barrel
        email.test.ts              colocated test (selector contract — VITEST short-circuit forces devLog)
      storage/
        storage.ts                 StorageEffects interface + lazy-import adapter selector (STORAGE_ADAPTER override → S3_ENDPOINT → BLOB_* → devLog)
        clientUpload.ts            browser dispatcher — switches on the discriminated `upload.kind` from mintUploadToken (vercel-blob-client put() vs presigned-put fetch())
        adapters/vercelBlob.ts     production adapter — owns env prefix + token-per-access; ONLY file that imports @vercel/blob
        adapters/s3.ts             local-dev adapter — talks to RustFS (compose service `storage`); ONLY file that imports @aws-sdk/client-s3 + s3-request-presigner
        adapters/devLog.ts         test/offline adapter — logs and returns placeholder URLs
        index.ts                   barrel
        storage.test.ts            colocated test (devLog contract)
      index.ts                     barrel
    logger/                        structured logging — JSON to stdout (captured by Vercel Runtime Logs)
      types.ts                     Logger interface — debug/info/warn/error + child(fields)
      server.ts                    pino-backed logger; createServerLogger(destination?) factory; createRequestLogger(request) helper
      browser.ts                   console + keepalive POST /api/log on warn|error; installGlobalHandlers() for window.error + unhandledrejection
      redact.ts                    pino redact paths — strips authorization/cookie headers if logged
      index.ts                     barrel — re-exports the Logger type
      server.test.ts               colocated; injectable destination → assert JSON shape, levels, child scope, redaction
      browser.test.ts              colocated; mocked fetch → assert forwarding, swallowed errors, child scope
  hooks/
    useMobile.ts                   media-query hook
    usePasskeys.ts                 TanStack Query wrappers around authClient.passkey.*
    useSavedLogin.ts               localStorage-backed last-email collection + hook
  components/
    DefaultCatchBoundary.tsx       router error boundary
    NotFound.tsx                   router 404
    AppSidebar.tsx                 main app shell sidebar
    ModeToggle.tsx                 light/dark/system theme toggle
    ThemeProvider.tsx              next-themes wrapper
    user/                          UserFormDialog.tsx, DeleteUserDialog.tsx, RestoreUserDialog.tsx, AvatarUpload.tsx, UserCard.tsx
    passkey/                       PasskeyRow.tsx, DeletePasskeyDialog.tsx
    document/                      DocumentList.tsx, DocumentUpload.tsx
    contact/                       ContactCard.tsx
    ui/                            shadcn primitives (kebab-case, CLI-managed)
  emails/                          React Email templates (server-rendered; consumed by smtp + resend adapters); preview with `pnpm email:dev`
    theme.ts                       Tailwind config + neutral palette + font-scale plugin (MIT; from React Email demo Studio pack)
    Fonts.tsx                      Inter + Geist via <Font> (MIT; from React Email demo Studio pack)
    MagicLinkEmail.tsx             magic-link template + renderMagicLink() helper (adapted from Studio activation.tsx)
    MagicLinkEmail.test.tsx        colocated; asserts subject + URL-in-html-and-text + non-empty bodies
  data/
    passkeyAaguids.json            static AAGUID → provider metadata registry
  utils/
    seo.ts                         meta-tag helper (pure function)
  styles/                          Tailwind v4 entry
test/
  setup.ts                         schema-per-test: CREATE SCHEMA + run migrations + SET search_path before each test, DROP SCHEMA after; localhost-DATABASE_URL guard
  scope.ts                         newScope() — per-test prefixed IDs/emails for scoped assertions
drizzle/                           generated SQL migrations
drizzle.config.ts                  schema path, output dir, Neon Local SSL workaround
compose.yaml                       Neon Local docker service (port 5432)
vite.config.ts                     TanStack Start + React + Tailwind + Nitro; vitest config
```

**Path alias**: `~/*` → `./src/*` (in `tsconfig.json`).

---

## How we write code

**Services own data access and domain rules.** All `db` access lives in `src/lib/services/<entity>/`; invariants live inside the guarded operations there (`updateAsAdmin`, `softDeleteAsAdmin`, …) and surface as a typed `<Entity>DomainError` with a discriminating English `code` union. Procedures `try { await service.op() } catch (err) { rethrowAsORPC(err, ...) }` to map codes to Swedish `ORPCError` messages. Callers import through the barrel: `import * as userService from '~/lib/services/user'`. Canonical example: `src/lib/services/user/`. See `docs/adr/0002-service-domain-architecture.md` for the architecture, the guarded-operation pattern, error mapping, and verification greps.

**Cross-system side effects stay out of services and live in `src/lib/effects/`.** A service touches its own DB tables and nothing else; cross-system work (Better Auth session revocation, Vercel Blob deletes, sending email) goes through a typed effect adapter (e.g. `email.sendMagicLink(...)`, `storage.delete(...)` from `~/lib/effects`) invoked from the procedure or route handler *after* the service call succeeds. This keeps services free of Better Auth / Vercel Blob / Resend imports and testable against the per-test-schema harness alone. See `docs/adr/0001-side-effects-architecture.md` for the full layering, the three execution tiers (sync-critical / fire-and-forget / durable), and the comparison to pub/sub.

**Logging goes through `~/lib/logger/`** — pino on the server, console + `keepalive` POST to `/api/log` in the browser. Inside an oRPC procedure use `context.log` (already tagged with `requestId` + `userId`); elsewhere import the singleton: `import { logger } from '~/lib/logger/server'` (or `~/lib/logger/browser` in components). Never call `console.*` directly. New significant events (admin actions, auth lifecycle, effect failures) get one `info` line; caught exceptions get one `error` line with `{ error }`. See `docs/adr/0003-logging-architecture.md` for the architecture, conventions (message-as-noun-phrase, structured fields over interpolation, level semantics), what-to-log policy, redaction, browser→server forwarding contract, and verification greps.

**Adding a feature schema**: create `src/lib/db/schema/<feature>.ts`, add one re-export line to `schema/index.ts`, then `pnpm db:generate --name=<descriptive_name> && pnpm db:migrate`. The test setup runs every migration into a fresh schema before each test, so any new table or seed migration is automatically applied — nothing in `test/setup.ts` needs touching when adding a feature schema.

**Name migrations descriptively, never ship the auto-generated tag.** Without `--name`, drizzle-kit emits files like `0003_small_jetstream.sql` — meaningless six months later. Always pass `--name=<descriptive_name>` at generation time: `pnpm db:generate --name=add_ownership_tables` (or `pnpm drizzle-kit generate --custom --name=seed_initial_seasons` for data-only migrations). The flag sets both the filename and the `tag` in `drizzle/meta/_journal.json` in one shot. If you forget and need to rename after the fact, update both the file and the journal `tag` together — and only do it for migrations that haven't shipped to production yet, since once a migration is in any prod `__drizzle_migrations` table the tag is part of its identity.

**Adding a service**: copy `services/user/` — `<entity>.ts` (named exports), `<entity>.test.ts` (colocated, `setupDatabase()` first), `index.ts` (barrel: `export * from './<entity>'`). Add `errors.ts` only when the first invariant lands. See ADR-0002 for the full recipe.

**Adding an effect**: create `src/lib/effects/<domain>/` containing `<domain>.ts` (typed interface plus the exported adapter), `adapters/<name>.ts` (one file per implementation — a `devLog` adapter is appropriate while the transport is deferred), `index.ts` (`export * from './<domain>'`), and `<domain>.test.ts` (colocated; pure if the adapter doesn't touch the DB). Extend `src/lib/effects/index.ts` with the new named export. Procedures and auth callbacks import the effect (`import { email } from '~/lib/effects'`) and call it after the service call. See `src/lib/effects/email/` for the canonical example; full rationale (why not pub/sub, when to reach for fire-and-forget or the outbox tier) lives in `docs/adr/0001-side-effects-architecture.md`.

**Regenerating Better Auth schema**: after upgrading `better-auth` or changing plugin config in `src/lib/auth.ts`, run:
```
pnpm dlx @better-auth/cli generate --yes --output src/lib/db/schema/betterAuth.ts
```
Never hand-edit `betterAuth.ts`.

**Adding a guarded route**: place the file under `src/routes/_authenticated/`. The pathless `_authenticated.tsx` route's `beforeLoad` redirects unauthenticated visitors to `/login`. The login route itself stays at `src/routes/login.tsx` (public).

**Component placement**: feature components live in `src/components/<entity>/<Component>.tsx` (entity-singular: `user/`, `passkey/`, etc. — same naming as `src/lib/services/<entity>.ts` and `src/lib/orpc/procedures/<entity>.ts`). Top-level `src/components/*.tsx` is reserved for app-wide chrome (sidebar, theme toggle, error/404). Don't use TanStack's `-components/` route-local convention — we promote every component to `src/components/<entity>/` so they're discoverable from one place and trivially shareable.

**Adding an oRPC procedure**: create or edit `src/lib/orpc/procedures/<entity>.ts`. Pick the right builder — `publicProcedure` (no auth), `protectedProcedure` (signed in, `context.session`/`context.user` are non-null), or `adminProcedure` (admin role, also enforces non-null). Validate input with `.input(zodSchema)`. **Handlers stay thin**: parse input → delegate to a service → catch `<Entity>DomainError` and rethrow as `ORPCError` with the Swedish message → run any cross-system side effects (e.g. `auth.api.revokeUserSessions`) *after* the service call succeeds. Never re-implement domain invariants inline in a handler — if you find yourself counting admins or checking `deletedAt` in a procedure, that rule belongs in the service. Then export from the file and add to `appRouter` in `src/lib/orpc/router.ts`. Call from the client via `orpc.<entity>.<op>.queryOptions()` / `.mutationOptions()` from `~/lib/orpc/client`.

**Route loader for oRPC data**: `loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(orpc.x.y.queryOptions())`, then read with `useSuspenseQuery(orpc.x.y.queryOptions())` in the component. SSR runs the procedure in-process via `createRouterClient` — no HTTP roundtrip during loaders.

**Mutations + invalidation**: `useMutation(orpc.x.create.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.x.list.queryKey() }) }))`. Use `.key()` (partial prefix) for bulk invalidation across an entity. Narrow errors with `isDefinedError(err)` from `@orpc/client`.

**Input validation**: Zod v4 (already a dep). Validate at the boundary (oRPC `.input(schema)`, server function args, route loaders) — trust internal call sites.

**Forms own all user input.** Every form uses `useAppForm` from `~/hooks/form`; fields render via `<form.AppField name="..." children={(field) => <field.TextField label="..." />}>` (or `<field.SelectField>`); submit gates via `<form.AppForm><form.SubmitButton label="..." /></form.AppForm>`. Field errors → `<FieldError>` (rendered by the bound component); async / API / mutation errors → `toast.error(...)` from `sonner`. Never store field values in `useState`. Canonical example: `src/components/login/LoginFormCard.tsx`. See `docs/adr/0005-form-architecture.md` for the architecture, the composition mechanism (`createFormHook`), the icon-button exception, the SSR door we leave open, and verification greps.

**Zod errors**: `src/lib/zodLocale.ts` calls `z.config(z.locales.sv())` at module load, imported once from `src/router.tsx`. Every Zod schema gets Swedish default error messages without per-field overrides — only pass an explicit message when you need wording more specific than the locale default.

**Adding a UI component**: `pnpm dlx shadcn@latest add <name>`. The CLI writes into `src/components/ui/`. Follow the rules in `.claude/skills/shadcn/SKILL.md` — semantic colors only (`bg-primary`, `text-muted-foreground`, never `bg-blue-500` or `dark:` overrides), `gap-*` not `space-y-*`, `size-*` for equal dimensions.

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server on :3000 |
| `pnpm dev:log` | Same as `dev`, but truncates `/tmp/oceanview-dev.log` on start and tees stdout+stderr there so Claude can read it |
| `pnpm build` | Vite build + `tsc --noEmit` typecheck |
| `pnpm vercel-build` | Run pending migrations, then build + typecheck (CI/deploy only) |
| `pnpm preview` | Preview built bundle |
| `pnpm start` | Run production server (`.output/server/index.mjs`) |
| `pnpm db:up` | Start the Neon Local on :5432. Each local git branch gets its own persistent Neon branch (metadata lives in `./.neon_local/`, gitignored), so `down`/`up` reuses the same branch instead of recreating one. Used by both the dev app and tests — tests carve out their own `test_w*` schemas so the dev `public` schema is untouched |
| `pnpm db:down` | Stop the `db` service. Leaves the queue running; preserves the Neon branch (delete `./.neon_local/` to force a fresh branch on next `up`) |
| `pnpm db:generate` | Generate a new migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations to the active `DATABASE_URL` |
| `pnpm db:studio` | Drizzle Studio UI |
| `pnpm queue:up` | Start the Redis broker for the local blurhash queue on :6379 (`compose.yaml` service `queue`). Only needed when `REDIS_URL` is set in `.env` |
| `pnpm queue:down` | Stop just the queue container (leaves Neon Local alone) |
| `pnpm queue:studio` | Open Bull Studio on http://localhost:4000 to inspect BullMQ queues. Profile-gated docker service (`emirce/bullstudio`); needs `pnpm queue:up` first. Stop with `pnpm dev:down` or `docker compose stop queue-studio` |
| `pnpm storage:up` | Start the local S3-compatible storage on :9000 (S3 API) and :9001 (web console). `compose.yaml` services `storage` (RustFS) + `storage-init` (one-shot bucket bootstrap via `mc`). Only needed when `S3_ENDPOINT` is set in `.env` |
| `pnpm storage:down` | Stop the storage + init containers (leaves Neon Local + queue alone) |
| `pnpm mail:up` | Start the local SMTP catcher Mailpit on :1025 (SMTP) and :8025 (web UI). `compose.yaml` service `mail`. Only needed when `SMTP_HOST` is set in `.env` |
| `pnpm mail:down` | Stop the Mailpit container (leaves the rest of the dev stack alone) |
| `pnpm email:dev` | Start the React Email preview server (`react-email dev --dir src/emails`) on http://localhost:3001 — browse and live-edit templates without going through the auth flow |
| `pnpm dev:up` | One-shot for the whole dev stack: brings up `db`, `queue`, `mail`, `storage`, runs `storage-init`, then runs `pnpm db:migrate` against the local DB so the schema is on `HEAD` |
| `pnpm dev:down` | One-shot for the whole dev stack: stops every service brought up by `dev:up` |
| `pnpm dev:worker` | Run the local BullMQ worker (`scripts/devBlurhashWorker.ts`) that consumes the `blurhash` topic and calls the same handler as the prod Nitro plugin |
| `pnpm test` | Vitest once. Every test gets its own `test_w<pool>_<n>` schema: CREATE SCHEMA + run all migrations + SET search_path in `beforeEach`, DROP SCHEMA in `afterEach`. Connects to :5432 via Neon Local's session-pool URL (`neondb_session`) so the per-test SET persists across queries and transactions; the dev app uses the same :5432 service via the default `neondb` URL |
| `pnpm test:watch` | Vitest watch mode (same DB rules as `pnpm test`) |
| `pnpm format` | Biome formatter only (writes) |
| `pnpm lint` | Biome linter only (no writes) |
| `pnpm lint:fix` | Biome linter with safe fixes (writes) |
| `pnpm check` | Biome format + lint + organize imports, safe writes — daily driver |
| `pnpm check:unsafe` | `check` plus unsafe fixes (Tailwind class sort etc.) — run occasionally |
| `pnpm check:ci` | `check` dry-run, no writes — exits non-zero on issues |

---

## Environment variables

**Auto-provisioned by the Vercel ↔ Neon Marketplace integration** (do not add manually): `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, plus `POSTGRES_*` / `PG*` aliases.

**Local-only** (`.env`, gitignored, used by `compose.yaml`): `NEON_API_KEY`, `PARENT_BRANCH_ID`.

**Set in Vercel + `.env`**: `BETTER_AUTH_SECRET` (32+ chars; `openssl rand -base64 32`), `BETTER_AUTH_URL` (site origin), `ADMIN_EMAILS` (comma-separated allowlist).

**Set in Vercel + `.env` (auto-provisioned via Marketplace)**: `BLOB_PUBLIC_READ_WRITE_TOKEN` (oceanview-public store, avatars), `BLOB_PRIVATE_READ_WRITE_TOKEN` (oceanview-private store, documents). For local dev, leave these blank and use the `S3_*` block below for fully offline uploads. Optional override: `STORAGE_ADAPTER=devLog` forces the no-op adapter (used in tests by default).

**Local-only — S3-compatible storage** (`.env`, gitignored; backs `pnpm storage:up`): `S3_ENDPOINT` (default `http://localhost:9000`), `S3_REGION` (`eu-north-1` — AWS Stockholm, matches the rest of the prod stack's geography), `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (default `oceanview-dev` / `oceanview-dev-secret-key`, set on the RustFS container via `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY`), `S3_BUCKET_PUBLIC` (`oceanview-public`), `S3_BUCKET_PRIVATE` (`oceanview-private`). When `S3_ENDPOINT` is set, the storage adapter selects `s3` (takes precedence over `BLOB_*`). Production never sets this — `vercelBlob` wins there. See ADR-0006 (Local S3 path).

**Set in Vercel + `.env` (after sender-domain verification)**: `RESEND_API_KEY`, `EMAIL_FROM`. The Resend adapter activates automatically when `RESEND_API_KEY` is set and `SMTP_HOST` is unset. Until DNS for `mail.<domain>` is verified, leave these blank — auth still works via the devLog fallback in production (URL appears in Vercel Runtime Logs).

**Local-only — Mailpit SMTP catcher** (`.env`, gitignored; backs `pnpm mail:up`): `SMTP_HOST` (default `localhost`), `SMTP_PORT` (default `1025`), `EMAIL_FROM` (sender — Mailpit accepts anything). When `SMTP_HOST` is set, the email adapter selects `smtp` (takes precedence over `RESEND_API_KEY` so `vercel env pull` accidents don't send real mail). Optional override: `EMAIL_ADAPTER=devLog` forces the no-op adapter (tests also short-circuit via `VITEST`). See ADR-0008.

**Optional**: `LOG_LEVEL` — pino level (`trace`/`debug`/`info`/`warn`/`error`/`fatal`). Defaults to `debug` in dev, `info` in prod.

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
- shadcn theming — https://ui.shadcn.com/docs/theming
- shadcn TanStack Form integration — https://ui.shadcn.com/docs/forms/tanstack-form
- TanStack Form — https://tanstack.com/form/latest
- TanStack Query — https://tanstack.com/query/latest/docs/framework/react/overview
- oRPC (overview) — https://orpc.dev/docs
- oRPC TanStack Start adapter — https://orpc.dev/docs/adapters/tanstack-start
- oRPC + Better Auth — https://orpc.dev/docs/integrations/better-auth
- oRPC + TanStack Query — https://orpc.dev/docs/integrations/tanstack-query
- oRPC SSR optimisation — https://orpc.dev/docs/best-practices/optimize-ssr
- next-themes (theme provider) — https://github.com/pacocoursey/next-themes
- Vite — https://vite.dev
- Vercel + TanStack Start — https://vercel.com/docs/frameworks/tanstack-start
- Vercel Blob — https://vercel.com/docs/vercel-blob
- Cloudflare R2 (documented fallback per ADR-0006) — https://developers.cloudflare.com/r2
- React Email — https://react.email/docs
- React Email Studio demo pack (template source) — https://github.com/resend/react-email/tree/canary/apps/demo/emails/05-Studio
- Resend — https://resend.com/docs
- Nodemailer — https://nodemailer.com/about/
- Mailpit (local SMTP catcher) — https://mailpit.axllent.org/docs/

---

## Deferred work

**Resend sender domain** — the `resend` adapter ships in `src/lib/effects/email/adapters/resend.ts`, but is gated on `RESEND_API_KEY` + `EMAIL_FROM` being set in Vercel (and `SMTP_HOST` being unset, which is the prod default). Pending DNS for `mail.<oceanview-domain>` (SPF/DKIM/return-path). Once verified, drop the values into Vercel envs — no code change. Until then, prod magic-links route through the `devLog` adapter and the URL appears in Vercel Runtime Logs. See ADR-0008.

---

## Non-negotiables

- **Magic-link only.** No passwords. Don't add password sign-in without revisiting the auth design.
- **Two roles only**: `user` and `admin`. Don't introduce more without a real reason.
- **All `db` access through `src/lib/services/<entity>/`. Services own data invariants** (admin-count, self-action, soft-delete checks) and raise typed `<Entity>DomainError`. Procedures map codes to Swedish `ORPCError`. No `db.select()` in routes/handlers/auth hooks. See ADR-0002.
- **oRPC procedures are thin glue.** Parse input, gate with `protectedProcedure` / `adminProcedure` (never inline auth checks), delegate to a service, catch `<Entity>DomainError` and map to `ORPCError`, then run cross-system side effects. Better Auth's own routes (`/api/auth/*`) stay on the Better Auth handler.
- **All logging goes through `~/lib/logger/`. Never call `console.*` directly in app code.** Inside an oRPC procedure use `context.log`; elsewhere import the singleton from `~/lib/logger/server` or `~/lib/logger/browser`. See ADR-0003.
- **Never hand-edit `src/lib/db/schema/betterAuth.ts`** — re-run the CLI (see [How we write code](#how-we-write-code)).
- **File naming.**
  - **Routes** (`src/routes/`) follow [TanStack file-naming conventions](https://tanstack.com/router/latest/docs/routing/file-naming-conventions): lowercase + special tokens (`__root`, `_authenticated`, `$id`, `index`).
  - **React components** are **PascalCase** matching the export — `UserCard.tsx` → `export function UserCard`. Feature components live in `src/components/<entity>/` (entity-singular, e.g. `user/`, `passkey/`) — same naming as `src/lib/services/<entity>.ts` and `src/lib/orpc/procedures/<entity>.ts`. Top-level `src/components/*.tsx` is reserved for app-wide chrome (sidebar, theme toggle, error/404 boundaries).
  - **Hooks** are **camelCase with `use` prefix** matching the export — `useMobile.ts` → `export function useMobile`.
  - **Everything else** (lib modules, utils, data, config — `.ts` / `.json`) is **camelCase** — `authClient.ts`, `passkeyProviders.ts`, `passkeyAaguids.json`.
  - **`src/components/ui/` is kebab-case** and CLI-managed by shadcn — don't normalize it.
  - **Directory roles**: `src/lib/` = wired/stateful modules (auth, db, orpc, services); `src/hooks/` = React hooks; `src/utils/` = pure helper functions; `src/data/` = static data.
- **File blobs in Vercel Blob (prod) or a local RustFS container (dev), metadata in Postgres.** Uploads go browser → storage directly; bytes never traverse a Vercel Function. Two stores/buckets: `oceanview-public` (avatars) and `oceanview-private` (documents). All file-related code goes through the `src/lib/effects/storage/` seam — `@vercel/blob` is only imported from `adapters/vercelBlob.ts`, `@aws-sdk/client-s3` only from `adapters/s3.ts`. The browser dispatcher (`clientUpload.ts`) switches on the discriminated `upload.kind` returned by `mintUploadToken`. See ADR-0006.
- **`vercel env pull` is dangerous**: it writes prod `DATABASE_URL` into `.env.local`, which Vite + Drizzle prefer over `.env`. If you must run it, immediately delete the `DATABASE_URL*` lines from `.env.local` — otherwise `pnpm db:migrate` would migrate **production**.
- **Migrations are explicit locally outside `pnpm dev:up`.** `pnpm dev:up` auto-runs `pnpm db:migrate` after the db container becomes healthy, so the dev DB stays on `HEAD`. `pnpm db:up`, `pnpm build`, and ad-hoc flows do **not** migrate — run `pnpm db:migrate` yourself in those cases. `vercel-build` migrates on deploy.
- **Conventional Commits** for agent commits: `<type>(<scope>): <subject>` ≤ 72 chars, imperative mood, *why* in the body. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `revert`.
- **Lock TanStack Start to a specific RC version** in `package.json` until 1.0 ships.
- **Free tier first.** Before adding any third-party service, confirm a free tier covers ~20 users.
- **Every screen must be responsive.** Design and implement all UI for desktop browsers, mobile browsers (iOS/Android phones), and tablets (iPad/Android tablets). Test layouts at small, medium, and large breakpoints — don't ship desktop-only views. Use Tailwind's responsive utilities (`sm:`, `md:`, `lg:`) and shadcn primitives that already adapt; avoid fixed pixel widths that break on narrow viewports.
- **User-facing text is Swedish.** UI labels, validation errors, toasts, page titles, SEO meta, and screen-reader (`sr-only`) text are written in Swedish using informal "du". The brand name "Oceanview" stays untranslated. Code identifiers, comments, log messages, commit messages, and DB enum values (e.g. role `user`/`admin`) stay in English. `<html lang="sv">` is set in `__root.tsx`.

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
- **File storage**: Vercel Blob in prod, local RustFS container (`compose.yaml` service `storage`) for offline dev, `devLog` for tests — same `StorageEffects` seam, three execution paths (mirrors the queue layer in ADR-0007). Two stores/buckets (`oceanview-public` for avatars, `oceanview-private` for documents) exposed by two oRPC routers split along the same access boundary (`imageRouter` for public uploads, `fileRouter` for private uploads + listing/deleting documents). `mintUploadToken` returns a discriminated `upload` payload (`vercel-blob-client` clientToken vs `presigned-put` URL); browser dispatcher in `src/lib/effects/storage/clientUpload.ts` picks the right transport. Cloudflare R2 stays documented as a swap-in fallback. See ADR-0006.
- **Email**: Resend in prod, Mailpit (compose service `mail`) + nodemailer in local dev, `devLog` for tests — same `EmailEffects` seam, three execution paths (mirrors storage and queue). Selector precedence: `VITEST`/`EMAIL_ADAPTER` override → `SMTP_HOST` → `RESEND_API_KEY` → `devLog` fallback. Magic-link send is tier-1 sync-critical (per ADR-0001's canonical example); future non-auth emails (invitations, reminders, digests) go through the queue (tier-3). Templates are React Email components in `src/emails/`, seeded from the React Email demo's Studio pack (MIT). See ADR-0008.
- **UI**: shadcn/ui (style `radix-nova`, base color `slate`) + Tailwind v4. CSS vars live in `src/styles/app.css`; `components.json` is the source of truth.
- **Dark mode**: `next-themes` with `attribute="class"` + system preference + manual toggle (`ModeToggle` mounted in `__root.tsx`). No flash on hard reload — next-themes injects its own preload script.
- **Forms**: `@tanstack/react-form` v1 `createFormHook` composition + shadcn `<Field>` primitives. `useAppForm` from `~/hooks/form` with bound `<field.TextField>` / `<field.SelectField>` / `<form.SubmitButton>`. Zod v4 schemas via `validators: { onSubmit: schema }`. See ADR-0005.
- **Data layer**: oRPC + TanStack Query (decided 2026-05-15). First-class TanStack Start adapter, native `Date`/`File`/`BigInt`, builder-based auth (`protectedProcedure` / `adminProcedure`) over `requireSession`-style helpers. Server-side procedures called in-process via `createRouterClient` during SSR (zero HTTP). See `src/lib/orpc/`.
- **Domain rules live in services; service files live in per-entity folders** (decided 2026-05-21). Services throw `<Entity>DomainError` (English `code` union); procedures map to Swedish `ORPCError`. `src/lib/services/<entity>/` with `<entity>.ts`, `errors.ts` (when invariants exist), `<entity>.test.ts`, one-line `index.ts` barrel. Imports stay `'~/lib/services/<entity>'`. See ADR-0002.
- **Logging is pino → stdout, captured by Vercel Runtime Logs** (decided 2026-05-21). No external observability service. Browser `warn`/`error` forwarded to `/api/log` so client crashes land in the same place. See ADR-0003 (`docs/adr/0003-logging-architecture.md`).
- **Realtime sync is server-push invalidation via SSE + in-process pub/sub** (decided 2026-05-21). Procedures `realtime.publish({ kind: '<namespace>.changed', ids })` after the service call; one `useRealtimeSync()` per authenticated tab dispatches to `queryClient.invalidateQueries({ queryKey: orpc.<namespace>.key() })`. Single-instance assumption — broker-backed adapter when that changes. See ADR-0004 (`docs/adr/0004-realtime-sync-architecture.md`).
- **Background jobs: Vercel Queues in prod, BullMQ + Redis (docker compose) in dev** (decided 2026-05-24). Both paths invoke the same handler in `src/lib/queue/handlers/<topic>.ts`; the Nitro `vercel:queue` plugin and `scripts/devBlurhashWorker.ts` are thin wrappers. Adapter selector in `src/lib/effects/queue/queue.ts` lazy-imports the chosen adapter on first publish — keeps BullMQ out of the prod cold-start path. Local broker only runs when `REDIS_URL` is set; otherwise dev falls back to the no-op `devLog` adapter and uploads work without the placeholder gradient.
- **Package manager**: pnpm.
- **Linter/formatter**: Biome — single tool over Prettier+ESLint or oxlint+Prettier. Editor-only enforcement (no CI gate, no git hook). Tailwind class sorting on; CSS skipped (Biome can't parse Tailwind v4 directives yet).
- **Sidebar breakpoint**: drawer (Sheet + scrim) below 1024px, icon rail at 1024–1279px, full sidebar ≥1280px. `MOBILE_BREAKPOINT` lives in `src/hooks/useMobile.ts` and only the shadcn sidebar primitive consumes it. shadcn `<Sidebar collapsible="icon">` with `tooltip={label}` on each `SidebarMenuButton` (icon-rail is the canonical exception to the "skip tooltips for self-evident icons" rule — the icon *is* the label). Sidebar-coupled responsive utilities use `lg:`; page padding and heading sizes still step at `md:`.

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
