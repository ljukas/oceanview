# TypeScript 7.0 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TypeScript 6.0.3 with TypeScript 7.0.2 (native Go compiler) as the repo's type-checker, and align the VS Code settings with it.

**Architecture:** Pure dependency swap. The `typescript` package has exactly two consumers — `tsc --noEmit` inside `pnpm build`/`vercel-build`, and the VS Code editor. Runtime bundles are produced by Vite/esbuild and are untouched. TS 7.0.2 was validated against this tree on 2026-07-08: clean pass, zero code changes (see the spec).

**Tech Stack:** pnpm 11 (with `minimumReleaseAge` gate), TypeScript 7.0.2, Vite 8, Vitest 4, GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-07-08-typescript-7-upgrade-design.md`

## Global Constraints

- devDependency becomes exactly `"typescript": "^7.0.2"`.
- `tsconfig.json` stays **byte-identical** — do not prune now-redundant options.
- `package.json` scripts stay untouched — TS7's bin is still `tsc`.
- All commits use `--no-gpg-sign` (signing prompts hang the session).
- Branch is `build/typescript-7` (already exists, carries the spec commit). Never force-push.
- PR title (= squash commit subject): `build(deps): upgrade TypeScript to 7.0 native compiler`.
- If `pnpm install` auto-adds `minimumReleaseAgeExclude` entries to `pnpm-workspace.yaml` (typescript@7.0.2 published 2026-07-08 15:55 UTC, inside the 24h gate), **keep them and commit them** — that's the repo's documented prune-later workflow.

---

### Task 1: Bump `typescript` to ^7.0.2

**Files:**
- Modify: `package.json:133` (devDependencies)
- Generated: `pnpm-lock.yaml`, possibly `pnpm-workspace.yaml` (auto-added exclude entries)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `node_modules/typescript` at 7.0.2, so `pnpm exec tsc` is the native compiler for Task 2's context and for CI.

- [ ] **Step 1: Edit the devDependency**

In `package.json`, change:

```json
    "typescript": "^6.0.2",
```

to:

```json
    "typescript": "^7.0.2",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates; `typescript 6.0.3 → 7.0.2` plus ~20 `@typescript/typescript-<platform>` optionalDependencies appear. If pnpm prints `Added N entries to minimumReleaseAgeExclude in pnpm-workspace.yaml`, that is expected — keep the file change.

- [ ] **Step 3: Verify the installed compiler is native 7.0.2**

Run: `pnpm exec tsc --version`
Expected: `Version 7.0.2`

- [ ] **Step 4: Type-check + build (the gate that changed)**

Run: `pnpm build`
Expected: Vite build succeeds, then `tsc --noEmit` exits 0 with no output. The type-check portion should be ~1s (was ~5.5s on 6.0.3).

- [ ] **Step 5: Run the test suite**

Run: `pnpm db:up && pnpm test`
Expected: both Vitest projects (`node`, then `browser`) pass. Tests don't consume `tsc` — this is regression insurance only. Requires the local db container (`:14520`) and Playwright Chromium (both already set up on this machine).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit --no-gpg-sign -m "build(deps): typescript 6.0.3 -> 7.0.2 (native compiler)

Type-check drops 5.5s -> ~1s wall. No compiler-API consumers in this
repo, so 7.0's no-programmatic-API limitation does not apply. tsconfig
and scripts unchanged; validated clean before the swap.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(If `pnpm-workspace.yaml` was not modified in Step 2, `git add` it anyway — adding an unmodified file is a no-op.)

### Task 2: Align VS Code settings (commit `useTsgo`, drop stale `tsdk`)

**Files:**
- Modify: `.vscode/settings.json:1-5` (file already has an uncommitted local change enabling `useTsgo`)

**Interfaces:**
- Consumes: Task 1 (workspace `typescript` is now 7.0.2, whose `lib/` contains no `tsserver.js`).
- Produces: nothing downstream.

- [ ] **Step 1: Remove the stale tsdk pointer**

In `.vscode/settings.json`, the file currently starts:

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "js/ts.experimental.useTsgo": true,
```

Delete the `"typescript.tsdk"` line so it starts:

```json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "js/ts.experimental.useTsgo": true,
```

Rationale: TS7 ships no `tsserver.js`, so the tsdk pointer is dead; with it removed, toggling `useTsgo` off falls back to VS Code's bundled tsserver instead of erroring.

- [ ] **Step 2: Verify the file is valid and formatted**

Run: `pnpm exec biome check .vscode/settings.json`
Expected: `Checked 1 file … No fixes applied.` and exit 0.

- [ ] **Step 3: Commit**

```bash
git add .vscode/settings.json
git commit --no-gpg-sign -m "chore(editor): use native TS (tsgo) in VS Code, drop stale tsdk

typescript@7 ships no tsserver.js, so the workspace tsdk pointer is
dead; removing it makes useTsgo=false fall back to the bundled tsserver.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: Push branch and open the PR

**Files:** none (git/GitHub only)

**Interfaces:**
- Consumes: Tasks 1-2 committed on `build/typescript-7` (plus the earlier spec commit).
- Produces: the PR whose squash commit lands on `main`.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin build/typescript-7`
Expected: branch published, no force flags.

- [ ] **Step 2: Create the PR**

```bash
gh pr create \
  --title "build(deps): upgrade TypeScript to 7.0 native compiler" \
  --body "$(cat <<'EOF'
Swaps the type-checker from TypeScript 6.0.3 to 7.0.2, the native Go
compiler GA'd 2026-07-08 (https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

**Why it's safe here**
- `typescript` has exactly two consumers in this repo: `tsc --noEmit` in
  `build`/`vercel-build`, and the VS Code editor. Vite/esbuild produce all
  runtime output — bundles are byte-identical.
- No compiler-API consumers (Biome, not typescript-eslint; drizzle-kit uses
  esbuild; shadcn bundles its own ts-morph; vitest 4 has no TS peer), so
  7.0's "no programmatic API until 7.1" limitation doesn't apply.
- Validated before the swap: 7.0.2 type-checks the tree clean with zero
  code changes; tsconfig and scripts are untouched.

**Result:** type-check drops from 5.5s to ~1s wall (8.5s → 4.0s CPU,
multithreaded).

Also commits the VS Code `useTsgo` setting and removes the stale
`typescript.tsdk` pointer (TS7 ships no tsserver.js).

Design: `docs/superpowers/specs/2026-07-08-typescript-7-upgrade-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 3: Watch required checks**

Run: `gh pr checks --watch`
Expected: `Check (Biome)`, `Build`, `Test`, `Validate Conventional Commit title` all pass. (`Audit` may stay red — pre-existing advisories, not required.)
