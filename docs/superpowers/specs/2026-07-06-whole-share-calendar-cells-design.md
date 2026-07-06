# Whole-share calendar cells — one merged cell per 2-week share block

**Status:** design • **Date:** 2026-07-06 • **Author:** brainstormed with Claude

## Context

The Disponeringslista (`DisponeringslistaTable`, fed by `season.listSchedules`) still renders **one cell per week**, a layout inherited from the half-share era: each share letter appears twice in adjacent columns ("J J"), and the owned-share highlight draws **two separate rings** around what is conceptually one booking. Since ADR-0018, shares are indivisible and every share always occupies exactly `WEEKS_PER_SHARE = 2` consecutive weeks — the per-week cells misrepresent the domain.

**Goal:** each share renders as **one cell spanning its two weeks** — letter shown once, one continuous color band, one owned-ring box — on both the desktop table and the mobile year cards.

**Non-goals:** no schema/migration, no procedure or error changes, no changes to the share chips in `ShareCard`/`OwnersTable`, no new ADR (this is presentation detail under ADR-0018/0019).

## Decisions (made during brainstorming)

1. **Merged cell wins at month boundaries.** A share block can straddle a month divider (e.g. 2027: share A = w21 in Maj + w22 in Jun, because the Maj band is one week wide). The share row always renders one merged cell; the vertical month divider shows in the month-band and week-number header rows but **stops above a straddling share cell**. Rejected: splitting the block at the boundary — it preserves the grid line but reintroduces the doubled letter the change exists to remove.
2. **Mobile: month sections + full-width block rows.** Keep the month headings; under each, one row per block (week range left, letter right). Rejected: a flat 10-row list per year (loses month scanning) and a 2-column block grid (ranges cramp on small phones).
3. **Pairing lives in the pure season logic.** Blocks are domain truth (`WEEKS_PER_SHARE`), so they are computed in `services/season/logic.ts` next to `shareForWeek`, covered by `logic.test.ts` (ADR-0002). Rejected: pairing in the component (untested UI copy of a domain rule) and replacing `cells` with blocks in the payload (bigger churn, no user-visible gain — the week-number header row still wants per-week data).

## Components

1. **`src/lib/services/season/logic.ts` — `ShareBlock` + `blocks` per `YearSchedule`** (pure).

   ```ts
   export type ShareBlock = {
     firstWeek: number
     lastWeek: number
     shareCode: ShareCode
     span: number // weeks; always WEEKS_PER_SHARE today, derived not hardcoded
   }
   ```

   `buildSchedules` additionally emits `blocks: Array<ShareBlock>` — the `WEEKS_PER_SEASON` weeks chunked into `WEEKS_PER_SHARE`-sized runs from `startWeek` (10 blocks/year). `cells` and `monthBands` are unchanged. The oRPC handler returns `buildSchedules(...)` verbatim, so the new field reaches the client through type inference with **no procedure change**.

2. **`DisponeringslistaTable` `WideLayout` — share row renders blocks.**
   - Month-band row and week-number row: unchanged (still per-week columns and `monthEndWeeks` borders).
   - Share row: one `<td colSpan={block.span}>` per block. Month divider `border-r` only when `monthEndWeeks.has(block.lastWeek)` — a straddling block gets no divider through it.
   - Current-year pastel (`shareBackgroundClass`) and the owned `ring-2 ring-inset ring-foreground` apply to the single merged cell — one box around both weeks.
   - `aria-label` on owned cells uses the new range message (see i18n).

3. **`DisponeringslistaTable` `MonthSection` — block rows.**
   - A block belongs to the month section of its **first** week. Sections are derived from block starts; a month band containing only the tail week of a block (e.g. a 1-week Okt band) renders **no heading** — its week already appears in the previous section's row. Empty sections are skipped.
   - Row layout: week range (`21–22`, en dash, `tabular-nums`) left, share letter right, full-width single column. The odd-week `needsPlaceholder` hack disappears (blocks are always whole).
   - Owned rows keep the ring + sr-only "my weeks" prefix.

4. **i18n (`messages/{sv,en}.json`).** Replace `season_my_week({week})` with a range variant `season_my_weeks({from, to})` (sv source of truth, en key-complete). No other strings change; the week-range text itself is numeric formatting, not a message.

## Testing

- **`logic.test.ts`** (mandatory, service change): blocks per year = `SHARE_CODES.length`; spans sum to `WEEKS_PER_SEASON`; every block's `shareCode` matches both underlying cells; a straddle fixture (2027-like era) yields a block whose two weeks fall in different months.
- **New browser component test** `DisponeringslistaTable.browser.test.tsx` (pure props, no router hooks): one cell per share with `colSpan = 2`; owned block renders the ring and the range aria-label; mobile section skips a tail-only month heading.
- **Live verification** (feature-workflow Phase 6): Chrome at desktop + mobile widths, light + dark, current year vs other years, owned vs unowned.

## Build order

`logic.ts` + tests → table (wide, then mobile) → i18n keys → browser test → live verify. Single concern, one PR.
