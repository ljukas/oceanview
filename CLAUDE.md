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
| Adding shadcn/ui components | `vercel:shadcn` + project-local `shadcn` (at `.claude/skills/shadcn/`) |
| Theming / CSS vars / dark mode tweaks | project-local `shadcn#customization.md` |
| Building or editing forms (TanStack Form + shadcn) | project-local `shadcn#rules/forms.md` |
| Reviewing React components | `vercel:react-best-practices` |
| End-to-end verification before claiming done | `vercel:verification` |
| Adding oRPC procedures, middleware, error handling | https://orpc.dev/docs |
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
    _authenticated.tsx             pathless guard: redirects unauthed → /login
    _authenticated/
      index.tsx                    dashboard / home
      contacts.tsx                 contacts page (placeholder)
      documents.tsx                file library page (placeholder, R2 not wired)
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
        user.ts                    list / getById / create / update / delete / restore
    db/
      index.ts                     drizzle(postgres(DATABASE_URL)) with snake_case casing
      schema/
        betterAuth.ts              CLI-regenerated; DO NOT hand-edit
        index.ts                   barrel — one re-export per feature schema
    services/
      user.ts                      user CRUD; ALL user db access lives here
      user.test.ts                 colocated test using newScope() + tx rollback from test/setup.ts
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
    user/                          UserFormDialog.tsx, DeleteUserDialog.tsx, RestoreUserDialog.tsx
    passkey/                       PasskeyRow.tsx, DeletePasskeyDialog.tsx
    ui/                            shadcn primitives (kebab-case, CLI-managed)
  data/
    passkeyAaguids.json            static AAGUID → provider metadata registry
  utils/
    seo.ts                         meta-tag helper (pure function)
  styles/                          Tailwind v4 entry
test/
  setup.ts                         per-test BEGIN/ROLLBACK hooks + localhost-DATABASE_URL guard
  scope.ts                         newScope() — per-test prefixed IDs/emails for scoped assertions
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

**Adding a feature schema**: create `src/lib/db/schema/<feature>.ts`, add one re-export line to `schema/index.ts`, then `pnpm db:generate && pnpm db:migrate`. Tests roll back their own writes (see [Tests](#how-we-write-code) below), so there's nothing to wire up in `test/setup.ts` when adding a new table.

**Name migrations descriptively, never ship the auto-generated tag.** drizzle-kit emits files like `0003_small_jetstream.sql` — that name is meaningless six months later. Immediately after `pnpm db:generate` (or `pnpm drizzle-kit generate --custom --name=<descriptive_name>` for data-only migrations), rename the file and update the corresponding `tag` in `drizzle/meta/_journal.json` to something that describes the change: `0003_add_ownership_tables.sql`, `0004_seed_initial_seasons.sql`, `0007_add_passkey_aaguid_index.sql`. Only rename migrations that haven't shipped to production yet — once a migration is in any prod `__drizzle_migrations` table, the tag is part of its identity and must stay stable.

**Adding a service**: create `src/lib/services/<entity>.ts` (named exports) plus colocated `<entity>.test.ts`. Tests run serially against Neon Local and are self-cleaning — `test/setup.ts` wraps every test in a Postgres `BEGIN`/`ROLLBACK`, so writes never persist past the test (this works because `src/lib/db/index.ts` caps the postgres-js pool at `max: 1` under `VITEST`, forcing every query through the same connection; that file also short-circuits `db.transaction(cb)` inside services to run the callback inline while the outer test tx is in flight, because postgres-js doesn't translate a nested `db.transaction()` into a SAVEPOINT and the inner `COMMIT` would otherwise leak past `ROLLBACK`). Use `newScope()` from `test/scope.ts` to mint unique IDs/emails per test (`scope.user('alice')`, `scope.email('alice')`); when asserting against global queries like `listAll()` or `countAdmins()`, filter the result by scope-owned IDs or assert on the delta — never assume the table is empty. When a test needs exclusive ownership of a shared catalog row (e.g. a single `share_part`), `DELETE` the conflicting rows inside the test (see `takeExclusivePart` in `src/lib/services/share.test.ts`) — the delete is also rolled back at the end.

**Regenerating Better Auth schema**: after upgrading `better-auth` or changing plugin config in `src/lib/auth.ts`, run:
```
pnpm dlx @better-auth/cli generate --yes --output src/lib/db/schema/betterAuth.ts
```
Never hand-edit `betterAuth.ts`.

**Adding a guarded route**: place the file under `src/routes/_authenticated/`. The pathless `_authenticated.tsx` route's `beforeLoad` redirects unauthenticated visitors to `/login`. The login route itself stays at `src/routes/login.tsx` (public).

**Component placement**: feature components live in `src/components/<entity>/<Component>.tsx` (entity-singular: `user/`, `passkey/`, etc. — same naming as `src/lib/services/<entity>.ts` and `src/lib/orpc/procedures/<entity>.ts`). Top-level `src/components/*.tsx` is reserved for app-wide chrome (sidebar, theme toggle, error/404). Don't use TanStack's `-components/` route-local convention — we promote every component to `src/components/<entity>/` so they're discoverable from one place and trivially shareable.

**Adding an oRPC procedure**: create or edit `src/lib/orpc/procedures/<entity>.ts`. Pick the right builder — `publicProcedure` (no auth), `protectedProcedure` (signed in, `context.session`/`context.user` are non-null), or `adminProcedure` (admin role, also enforces non-null). Validate input with `.input(zodSchema)`. Delegate DB work to a service. Then export from the file and add to `appRouter` in `src/lib/orpc/router.ts`. Call from the client via `orpc.<entity>.<op>.queryOptions()` / `.mutationOptions()` from `~/lib/orpc/client`.

**Route loader for oRPC data**: `loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(orpc.x.y.queryOptions())`, then read with `useSuspenseQuery(orpc.x.y.queryOptions())` in the component. SSR runs the procedure in-process via `createRouterClient` — no HTTP roundtrip during loaders.

**Mutations + invalidation**: `useMutation(orpc.x.create.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.x.list.queryKey() }) }))`. Use `.key()` (partial prefix) for bulk invalidation across an entity. Narrow errors with `isDefinedError(err)` from `@orpc/client`.

**Input validation**: Zod v4 (already a dep). Validate at the boundary (oRPC `.input(schema)`, server function args, route loaders) — trust internal call sites.

**Forms own all user input.** Any text input, select, checkbox, or confirmation that captures or mutates data goes through `@tanstack/react-form`. **Never store field values in `useState`** — `useForm` is the only field-state primitive in this codebase. This applies to dialogs and inline edits too (see `RenamePasskeyForm` in `src/components/passkey/PasskeyRow.tsx` for an inline example, and `src/components/user/UserFormDialog.tsx` for a dialog with create+edit shapes).

Canonical pattern (see `src/routes/login.tsx`):

- `useForm({ defaultValues, validators: { onSubmit: zodSchema }, onSubmit })` — validate on submit, not onChange.
- `<form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>` — never a raw `<form action>` or an `onSubmit` that bypasses the form instance.
- Each field rendered via `<form.Field name="..." children={(field) => …}>`, wrapped in shadcn `<FieldGroup>` / `<Field>` / `<FieldLabel>` / `<Input>` (or `<Select>`) / `<FieldError>`.
- Compute `const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid` once per field; pass to `<Field data-invalid>` and `<Input aria-invalid>`; render `<FieldError errors={field.state.meta.errors} />` only when invalid.
- Disable inputs during submit via `disabled={form.state.isSubmitting}`.
- Drive the submit button with `<form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]} children={…}>` — `disabled={!canSubmit || isSubmitting}`, render `<Spinner />` while submitting.
- **Field-level errors** → `<FieldError>`. **Async / API / mutation errors** → `toast.error(...)` from `sonner`. Don't mix the two channels.
- **Mutations** integrate via oRPC's `mutationOptions({ onSuccess, onError })` — invalidate with `queryClient.invalidateQueries({ queryKey: orpc.<entity>.<op>.key() })`, then `toast.success(...)` and close the dialog.

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
| `pnpm db:up` | Start Neon Local in docker (creates ephemeral branch off prod) |
| `pnpm db:down` | Stop Neon Local (deletes the ephemeral branch) |
| `pnpm db:generate` | Generate a new migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations to the active `DATABASE_URL` |
| `pnpm db:studio` | Drizzle Studio UI |
| `pnpm test` | Vitest once (serial, against Neon Local) |
| `pnpm test:watch` | Vitest watch mode |
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
- **All non-auth server calls go through oRPC procedures.** Procedures handle auth (pick `protectedProcedure` / `adminProcedure`, never inline checks) and Zod validation; services still own all `db` access. Better Auth's own routes (`/api/auth/*`) stay on the Better Auth handler.
- **Never hand-edit `src/lib/db/schema/betterAuth.ts`** — re-run the CLI (see [How we write code](#how-we-write-code)).
- **File naming.**
  - **Routes** (`src/routes/`) follow [TanStack file-naming conventions](https://tanstack.com/router/latest/docs/routing/file-naming-conventions): lowercase + special tokens (`__root`, `_authenticated`, `$id`, `index`).
  - **React components** are **PascalCase** matching the export — `UserCard.tsx` → `export function UserCard`. Feature components live in `src/components/<entity>/` (entity-singular, e.g. `user/`, `passkey/`) — same naming as `src/lib/services/<entity>.ts` and `src/lib/orpc/procedures/<entity>.ts`. Top-level `src/components/*.tsx` is reserved for app-wide chrome (sidebar, theme toggle, error/404 boundaries).
  - **Hooks** are **camelCase with `use` prefix** matching the export — `useMobile.ts` → `export function useMobile`.
  - **Everything else** (lib modules, utils, data, config — `.ts` / `.json`) is **camelCase** — `authClient.ts`, `passkeyProviders.ts`, `passkeyAaguids.json`.
  - **`src/components/ui/` is kebab-case** and CLI-managed by shadcn — don't normalize it.
  - **Directory roles**: `src/lib/` = wired/stateful modules (auth, db, orpc, services); `src/hooks/` = React hooks; `src/utils/` = pure helper functions; `src/data/` = static data.
- **File blobs in R2, metadata in Postgres** (when R2 is wired). Uploads go browser → R2 directly; never proxy bytes through Vercel.
- **`vercel env pull` is dangerous**: it writes prod `DATABASE_URL` into `.env.local`, which Vite + Drizzle prefer over `.env`. If you must run it, immediately delete the `DATABASE_URL*` lines from `.env.local` — otherwise `pnpm db:migrate` would migrate **production**.
- **Migrations are explicit locally.** `pnpm build` does not migrate. `vercel-build` does, on deploy. Run `pnpm db:migrate` yourself against the local ephemeral branch.
- **Tests run only against Neon Local.** `test/setup.ts` enforces this with a localhost-only guard; the per-test `BEGIN`/`ROLLBACK` then ensures tests can't pollute the local branch either.
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
- **File storage**: Cloudflare R2 — not Vercel Blob (zero egress fees).
- **Email**: Resend.
- **UI**: shadcn/ui (style `radix-nova`, base color `slate`) + Tailwind v4. CSS vars live in `src/styles/app.css`; `components.json` is the source of truth.
- **Dark mode**: `next-themes` with `attribute="class"` + system preference + manual toggle (`ModeToggle` mounted in `__root.tsx`). No flash on hard reload — next-themes injects its own preload script.
- **Forms**: `@tanstack/react-form` composed with shadcn `<Field>` primitives. Zod v4 schemas via `validators: { onSubmit: schema }`. See `src/routes/login.tsx`.
- **Data layer**: oRPC + TanStack Query (decided 2026-05-15). First-class TanStack Start adapter, native `Date`/`File`/`BigInt`, builder-based auth (`protectedProcedure` / `adminProcedure`) over `requireSession`-style helpers. Server-side procedures called in-process via `createRouterClient` during SSR (zero HTTP). See `src/lib/orpc/`.
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
