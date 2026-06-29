# Three-tier surface token system

**Date:** 2026-06-29
**Status:** approved (design) — implementation in progress
**Touches:** ADR-0015 (visual identity). This is a design decision → ADR-0015 gets a dated amendment.

## Context

The app already gestures at a Linear-style three-tier surface model — sidebar (darkest) → page surface (off-white) → content cards (white, lifted) — but the token vocabulary leaks, so the tiers aren't applied consistently:

- The page-surface tier exists as `--canvas` (light `oklch(0.99 0 0)`), but its utility `bg-canvas` is used in **exactly one place** (`SidebarInset`) and is otherwise unknown to the codebase.
- `--background` (pure white) is overloaded: it's both the Tier-3 white value *and* the shadcn primitive default (outline buttons, calendar, inputs, sidebar internals). So when a developer wants "the page surface," they reach for the obvious-sounding `bg-background` — and get pure white, a tier too light.
- That misuse is the reported bug: the documents table header (`bg-background`, pure white) sits on the off-white page surface and reads as a white block instead of blending. The same misuse exists on the Owners table header and the mobile selection bar.

**`bg-background` doesn't say which of the three tiers you mean.** The fix is to give the three tiers an explicit, symmetric, self-documenting vocabulary and apply it consistently.

## Decision

Introduce an **app-facing semantic surface scale**, layered over the existing shadcn tokens (which stay as the primitive layer):

| Tier | New utility | Backed by | Light | Dark (new) |
|---|---|---|---|---|
| 1 — chrome / sidebar (darkest) | `bg-surface-sidebar` | `--sidebar` | `oklch(0.97 0 0)` | `oklch(0.165 0 0)` |
| 2 — page surface (off-white) | `bg-surface-page` | `--canvas` | `oklch(0.99 0 0)` | `oklch(0.185 0 0)` |
| 3 — content / card (lifted) | `bg-surface-raised` | `--card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` |

Implemented in `src/styles/app.css`'s `@theme inline` block as aliases:

```css
--color-surface-sidebar: var(--sidebar);
--color-surface-page: var(--canvas);
--color-surface-raised: var(--card);
```

Underlying tokens (`--sidebar`, `--canvas`, `--card`) keep their names — one source of truth per value; no duplicate tokens to keep in sync. shadcn components in `src/components/ui/` keep using `bg-sidebar` / `bg-card` / `bg-background` (the primitive layer); `bg-surface-*` is the vocabulary for hand-written **app layout** surfaces.

The ambiguous `bg-canvas` utility is removed (its `--color-canvas` mapping dropped) once its one consumer migrates to `bg-surface-page` — so there's exactly one name for the page tier.

### Dark mode gets three distinct tiers

Today dark mode collapses to two levels (`--canvas` == `--background` == `0.145`; `--card` == `--sidebar` == `0.205`), so the sidebar is *not* the darkest tier. The Linear dark reference (user-provided) shows three distinct tiers: sidebar darkest → page → card lightest. New dark values:

- `--sidebar`: `0.205` → **`0.165`** (now the darkest)
- `--canvas`: `0.145` → **`0.185`** (page surface, lifts off the sidebar frame)
- `--card`: stays **`0.205`** (content lifts off the page)

`--background` stays `0.145` (the shadcn primitive base — unchanged blast radius). Exact steps tuned against the reference in the browser; ordering (sidebar < canvas < card) is the invariant.

## Migration scope — the page-composition boundary

`bg-surface-*` names the **page-composition tiers**: the surfaces that build up a page. Overlays (popovers, sheets, toasts, floating pills, drag previews) float *above* the page stack and are **not** page tiers — they keep `bg-card` / `bg-popover`. Emails are out of scope (email clients don't use the app theme).

**Migrate to `bg-surface-page`** (page tier):
- `src/routes/_authenticated.tsx` — `SidebarInset` (`bg-canvas` → `bg-surface-page`) — *pixel-identical*.

**Migrate to `bg-surface-raised`** (content panels resting on the page) — *all pixel-identical* (alias of `--card`, which is not re-valued):
- `src/components/user/ProfileCard.tsx`, `src/routes/_authenticated/account/security.tsx`, `src/components/share/SharePartCard.tsx`, `src/components/season/DisponeringslistaTable.tsx` (×2), `src/components/document/views/DocumentBin.tsx` (×2), `src/components/document/card/DocumentCard.tsx`, `src/components/document/card/FolderCard.tsx` (×3).

**Leave on `bg-card` (overlay / floating — not a page tier):**
- `UploadQueueBox`, `DocumentSelectionBar`, `DocumentsDesktop` drag previews, `AssignmentHistorySheet` items, `BrandEmailLayout` (email).

> Reviewer note: this boundary (page-resting card → `bg-surface-raised`; floating card → `bg-card`) is a judgment call. If you'd rather migrate *all* card surfaces (incl. overlays) or keep the migration minimal (page tier only), the refactor commit is isolated and easy to trim/extend.

## Execution — one hat per commit (refactor-workflow Phase 0 + prime directive)

This work is three different hats; each is a separate commit so every diff is all-structure or all-behavior. Strategy: **Parallel Change** (expand the vocabulary → migrate consumers → contract the old utility).

1. **`refactor(ui): introduce semantic surface-tier tokens`** — *behavior-preserving, pixels identical.*
   Add the three `--color-surface-*` aliases; migrate `SidebarInset` + the page-resting card panels to `bg-surface-*`; drop the now-unused `--color-canvas` mapping. Verify: build green + rendered values unchanged.
2. **`fix(ui): sticky table headers/bars use the page surface, not pure white`** — *behavior change (the reported bug).*
   `DocumentTableHeader`, `OwnersTable`, `DocumentMobileSelectionBar`: `bg-background` → `bg-surface-page`. Light mode: white → off-white (the fix). Verify visually.
3. **`style(ui): give dark mode three distinct surface tiers`** — *behavior change (restyle).*
   Dark `--sidebar` → 0.165, `--canvas` → 0.185. Verify visually in dark against the Linear reference.

(Squash-merge collapses these to one commit on `main`; the split keeps the branch reviewable per refactor-workflow Phase 5.)

## Verification (Phase 1 safety net + Phase 6 preservation)

No unit tests assert token color values, so the safety net for this visual change is **before/after browser comparison**:

- **Automated:** `pnpm build` (runs `tsc --noEmit`) green after each commit; `pnpm check:ci` clean. Confirm `bg-surface-page` resolves to the same value `bg-canvas` did (pixel-identical claim for commit 1).
- **Visual:** a token-preview harness rendering all three tiers + a mock sticky table header + a content card, in light and dark, **before vs after** — directly comparable to the Linear dark reference. (The local DB is empty, so the live documents table shows an empty state rather than the header; the harness isolates exactly what changed.)
- **Live spot check:** the running dev app (`:14500`) — `/account/profile` renders the page-vs-card tier separation without needing seeded data; toggle dark mode.

## Out of scope / non-goals (YAGNI)

- Not changing `--background`'s value (high blast radius: outline buttons, calendar, sidebar, inputs).
- Not migrating overlays/floating surfaces or emails.
- Not introducing per-tier `--surface-*` value tokens (the aliases keep one source of truth).
