# ADR 0009 — Organization Rules

- **Status**: Accepted (living)
- **Date**: 2026-05-27
- **Deciders**: Lukas
- **Decision in one line**: Rules the co-ownership group has agreed to socially — but that the schema doesn't naturally express — live in this ADR. Each rule is encoded in the relevant service as either a **hard rule** (typed `<Entity>DomainError` raised pre-commit, per ADR-0002) or a **soft default** (a default value used when the input omits the field, override accepted). One entry per rule below describes the encoding and where it lives. New rules append to the [Rules](#rules) section.

---

## Context

Some things about Oceanview are physical truths the schema can encode: 10 shares, 20 halves, half-open assignment ranges, one active owner per part. Those live in `drizzle/0007_add_invariant_checks.sql` and the per-table CHECK constraints — see ADR-0002's "Decisions made" section.

Other things are **social rules** the co-ownership group has agreed to, that the schema *can* represent but shouldn't permit as a final state of any mutation. For example: "every owner must hold at least one whole share." The schema can store fragmentary ownership; the social rule says that's never the desired end state of a user-facing operation.

Three options for where to enforce social rules:

1. **In the form** — UI-level only. Bypassed by any non-form caller. Drifts the moment a second caller appears.
2. **In the DB** as triggers. Survives every caller but lives in SQL, far from the rest of the domain logic. Per-row semantics make "rule satisfied if the final state is valid" awkward to express.
3. **In the service**, pre-commit, inside the mutation transaction. Matches ADR-0002 (services own invariants; raise typed `<Entity>DomainError`; procedures translate to Swedish). Runs once per logical operation; rolls back atomically on violation. Cheap to unit-test.

We chose (3). This ADR is the index — the canonical place to look up which social rules exist, what they require, and where they're enforced.

---

## Decision (TL;DR)

**Each organization rule gets one entry below. A rule is encoded in one of two ways:**

- **Hard rule** — a typed `<Entity>DomainError` code raised pre-commit inside the mutation transaction by the relevant service. The procedure layer maps the code to a Swedish `ORPCError`. Use this when the schema *can* represent the disallowed state and we want it rejected at the boundary.
- **Soft default** — a constant the service falls back to when the caller omits the field. Overrides pass through unchanged. Use this when the convention is the right answer 99% of the time but the rare manual override should still be possible from the admin UI.

Concretely:

- The rule statement, allowed states, and disallowed states are spelled out in this ADR — the single place to find them.
- Hard rules are implemented as a named helper in the entity's service (e.g. `assertEveryAffectedUserHasWhole(tx, userIds)`) and called from every service entry point that could violate the rule.
- Soft defaults are an exported constant from the entity's service (e.g. `SEASON_START_WEEK`) consumed by both the service (`createX` fallback) and the procedure layer (`suggestedNext` payload).
- New rules append a new section under [Rules](#rules). When a rule changes, edit the section and bump the `Last updated` date.

---

## Per-rule template

Each entry uses this shape:

```
### Rule N: <short name> (YYYY-MM-DD)

- **Last updated**: YYYY-MM-DD
- **Statement**: one-sentence rule.
- **Allowed**: the states that satisfy it.
- **Disallowed**: the states that violate it (or "none — soft default" if overrides are accepted).
- **Why**: the social/operational reason.
- **Encoding**: `hard — <DomainError code>` or `soft — default value (<CONSTANT_NAME>)`.
- **Enforced in**: file path + helper / constant name.
- **Skipped by**: any low-level helpers that intentionally bypass (with reason). Omit when not applicable.
```

---

## Rules

### Rule 1: Every owner holds at least one whole share (2026-05-27)

- **Last updated**: 2026-05-27
- **Statement**: Every user with active share assignments must own at least one **whole share** (both halves of some share A–J).
- **Allowed**:
  - 1 whole share (the minimum to participate as an owner).
  - 1 whole + one or more extra halves (a full share plus loose weeks).
  - Multiple whole shares.
  - **Zero assignments** — non-owner users are valid. The rule only fires when a user has at least one active assignment.
- **Disallowed**:
  - Just one half (e.g. only B1).
  - Multiple halves from different shares with no whole (e.g. A1 + B2 + C1).
  - Any path through `assignShareAsAdmin` / `unassignShareAsAdmin` that would leave an active user in either of the above states.
- **Why**: Ownership rotates by *share*, not by *half*. The default is "Alice owns share B" — both halves, both weeks. Splitting a share between two users is a real but uncommon case (one owner can't commit to a full season; a temporary trade between existing owners; etc.). A user holding scattered halves doesn't own a season — they own fragments, with no continuous block of weeks to plan around. The rule encodes "you're in the co-ownership group only when you hold at least one whole share."
- **Encoding**: `hard — ShareDomainError('LEAVES_USER_WITH_ONLY_HALVES')`. Mapped by `rethrowAsORPC` in `src/lib/orpc/procedures/share.ts` to `ORPCError('CONFLICT', { message: 'Användaren skulle bara äga halvor — varje ägare måste ha minst en hel andel' })`.
- **Enforced in**: `src/lib/services/share/share.ts` → `assertEveryAffectedUserHasWhole(tx, userIds)`. Called pre-commit, inside the mutation tx, from `assignShareAsAdmin` and `unassignShareAsAdmin`. Scoped to **affected users only** (new owners + anyone displaced) — we do not re-audit the whole user base on every mutation.
- **Skipped by**: the low-level `assignPart` / `unassignPart` helpers, which the season service and tests use to set up arbitrary scenarios. Going through the admin-facing service methods is what triggers the check.
- **Consequence — mid-stream splits**: splitting a previously-whole share between two users requires both to already own at least one whole. The admin UI surfaces the typed error if a submission would violate the rule.
- **Consequence — not retroactive**: existing data is not re-validated on every mutation; only the affected users are checked. If a user already holds only halves (only reachable via the low-level helpers), they stay that way until the next admin mutation touches them.

### Rule 2: Every season starts on ISO week 21 (2026-05-29)

- **Last updated**: 2026-05-29
- **Statement**: Every season's `startWeek` defaults to ISO week 21 — the canonical Disponeringslista anchor agreed by the co-ownership group.
- **Allowed**:
  - The default path: `createSeason({ year, startShare })` (no `startWeek`) → row stored with `startWeek = 21`.
  - An explicit admin override: any `startWeek` in `[1, 53]` (the schema CHECK range) passes through unchanged.
- **Disallowed**: none — this is a soft default. The DB CHECK on `season.start_week` (1–53) is the only hard floor/ceiling; the rule itself is enforced only as a pre-fill, so an admin can deviate from week 21 from the "Ny säsong" dialog without the server rejecting it.
- **Why**: The Disponeringslista is built around a fixed yearly anchor — every owner plans their 20-week season knowing it starts the same week each year. Past code computed the anchor from the calendar ("second-to-last Thursday in May"), which produced W20 in years where May 31 fell Mon/Tue/Wed. That heuristic was wrong: the group's convention has no calendar exceptions. Keeping the field overridable preserves an escape hatch for the rare year where the group might shift the anchor without forcing a code change.
- **Encoding**: `soft — default value (SEASON_START_WEEK)`. Exported from `src/lib/services/season/season.ts`. Consumed by `createSeason` as the fallback when `input.startWeek` is omitted, and by the `season.suggestedNext` procedure to pre-fill the admin dialog.
- **Enforced in**: `src/lib/services/season/season.ts` → `SEASON_START_WEEK` constant + the `??` fallback in `createSeason`. The "Ny säsong" dialog (`src/components/season/CreateSeasonDialog.tsx`) shows the start-week field pre-filled with 21 — editable, but rarely touched.
- **Consequence — no retroactive migration**: existing seasons with `startWeek = 20` (the years the old heuristic produced) keep their stored values. The rule only affects new seasons created after this ADR landed.

---

## Adding a new rule

1. Append a new `### Rule N: …` section under [Rules](#rules) using the template above.
2. Pick an encoding:
   - **Hard rule**: add a `<Entity>DomainError` code in `src/lib/services/<entity>/errors.ts`, implement the check as a named helper inside the relevant service, call it pre-commit from every entry point that could violate the rule, and map the new code in the entity's `rethrowAsORPC` (Swedish user-facing message).
   - **Soft default**: export a named constant from the service, use it as the `??` fallback in `createX` / `updateX`, and surface it in the `suggestedNext`-style procedure that feeds the admin UI.
3. Cover with positive and negative unit tests (for soft defaults: the default-applied case and the explicit-override case).

## Revisit triggers

- A bypass surfaces — a flow writes domain state outside the service. Move enforcement to a DB trigger for that rule.
- A rule changes (e.g. "every owner must hold *exactly* one whole" or "splits permanently disallowed"). Edit the rule's section, update the helper, update the test cases.
- A new ownership- or state-changing flow appears (user-to-user transfer, season-boundary rotation, etc.). Confirm it routes through the invariant-checked entry points.
