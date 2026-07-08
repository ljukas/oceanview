# TypeScript 7.0 upgrade — design

**Date**: 2026-07-08
**Status**: Approved
**Reference**: [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) (published 2026-07-08)

## Goal

Replace TypeScript 6.0.3 with TypeScript 7.0 (the native Go compiler) as the repo's
type-checker. TS7 is a faithful port of the JS compiler with ~5-10× speedups; the
repo's measured type-check time drops from 5.5s to 1.0s wall (8.5s → 4.0s CPU,
multithreaded with `--checkers 4` by default).

## Why this is low-risk here

Validated empirically on 2026-07-08 against `typescript@7.0.2`:

- `tsc --noEmit` with 7.0.2 passes **clean, exit 0, zero code changes** (verified
  genuine with an injected canary error, which it caught).
- The `typescript` package has exactly two consumers: `tsc --noEmit` in
  `build`/`vercel-build` (CI runs the same script) and the VS Code editor. TypeScript
  is never used for emit — Vite/esbuild transpiles, so runtime output is untouched.
- **No compiler-API consumers**, so 7.0's "ships without a programmatic API until
  7.1" limitation doesn't apply: Biome (not typescript-eslint), drizzle-kit
  (esbuild/tsx), shadcn CLI (bundles its own ts-morph), vitest 4 (no `typescript`
  peer at all), Better Auth CLI (pinned `pnpm dlx`, self-contained), no Volar-based
  tooling.
- Only two `typescript` peer ranges in the lockfile, both optional and open-ended:
  `>=5.6` (@inlang/paraglide-js), `>=4.9.5` (cosmiconfig via shadcn). Both satisfied
  by 7.x.
- `tsconfig.json` already matches 7.0's hard requirements: `strict: true`,
  `module: ESNext`, `moduleResolution: Bundler`, `esModuleInterop: true`, no
  `baseUrl` (paths are tsconfig-relative), modern `target`.
- Platform: `engines.node >=16.20`; per-platform native binaries ship as
  optionalDependencies (darwin-arm64 locally, linux-x64 on CI/Vercel — Node 24
  everywhere).

## Changes

1. **`package.json`**: devDependencies `"typescript": "^6.0.2"` → `"^7.0.2"`;
   `pnpm install` updates the lockfile (adds the platform-binary
   optionalDependencies).
2. **`pnpm-workspace.yaml`**: 7.0.2 was published 2026-07-08 15:55 UTC, inside the
   24h `minimumReleaseAge` window, so pnpm auto-adds a `minimumReleaseAgeExclude`
   entry. Keep it — that is the documented prune-later workflow already commented
   in that file.
3. **`.vscode/settings.json`**: commit `"js/ts.experimental.useTsgo": true`
   (already enabled locally, currently uncommitted) and **remove**
   `"typescript.tsdk": "node_modules/typescript/lib"` — TS7 ships no `tsserver.js`,
   so the pointer would break anyone toggling `useTsgo` off. Without it, VS Code
   falls back to its bundled tsserver.
4. **Nothing else changes**: `build`/`vercel-build` keep `tsc --noEmit` verbatim
   (7.0's bin is still `tsc`); `tsconfig.json` stays byte-identical. Now-redundant
   options (`strict`, `esModuleInterop`, …) are deliberately kept — they document
   intent, and pruning them would hide the real change in the diff.

## Verification

- Local: `pnpm build` (vite build + tsc7 type-check) and `pnpm test` (node + browser
  projects).
- PR: the required Check (Biome) / Build / Test CI gates re-verify.

## Rollback

Revert the single squash-merged commit. No code depends on 7.x-specific behavior;
6.0.3 checked the same tree clean.

## Risks

- **Day-one GA compiler bugs**: blast radius is limited to false results in the
  type-check step; CI catches, revert is one commit. Runtime bundles are unaffected.
- **`useTsgo` is still experimental in VS Code**: already in daily use in this repo;
  built-in VS Code support is rolling out per the announcement. Worst case, toggling
  it off falls back to VS Code's bundled tsserver.

## Rejected alternatives

- **Side-by-side aliases** (`typescript` → `npm:@typescript/typescript6`,
  `typescript-7` → `npm:typescript@7`): the announcement's escape hatch for repos
  with compiler-API consumers. This repo has none — pure ceremony.
- **Wait for 7.1** (programmatic API, ~3-4 months): nothing here needs the API;
  waiting forfeits a free 5× type-check speedup on every build and CI run.

## PR shape

One branch, one concern, squash-merged. Title:
`build(deps): upgrade TypeScript to 7.0 native compiler`. Description: the why
(speedup, no API consumers, zero code changes) + announcement link. The spec and
the implementation land as separate commits on the branch.
