import { expect, test } from 'vitest'
import { activeSeasonYearFor, extraBlocksForSeason, nominalSlotsForSeason } from './logic'

// 2026 under the seeded era (2024/21/J): startShare D — see the fixture
// background in docs/plans/season-booking/02-logic.md.
const SEASON_2026 = { startWeek: 21, startShare: 'D' } as const

test('activeSeasonYearFor: mid-season dates target the ongoing season', () => {
  expect(activeSeasonYearFor(new Date('2026-07-06T12:00:00Z'))).toBe(2026)
})

test('activeSeasonYearFor: the round flips at the start of ISO week 43', () => {
  // 2026-10-18 is the Sunday of ISO week 42; 2026-10-19 the Monday of week 43.
  expect(activeSeasonYearFor(new Date('2026-10-18T12:00:00Z'))).toBe(2026)
  expect(activeSeasonYearFor(new Date('2026-10-19T12:00:00Z'))).toBe(2027)
})

test('activeSeasonYearFor: early January inside ISO week 53 of a 53-week year', () => {
  // 2026 is a 53-week ISO year (Jan 1 2026 is a Thursday). 2027-01-01 falls
  // in ISO week 53 of ISO year 2026 — >= 43, so the active season is 2027.
  // Plain getFullYear would also say 2027 here, but getISOWeekYear is what
  // keeps the pair (week, year) consistent for the >= 43 comparison.
  expect(activeSeasonYearFor(new Date('2027-01-01T12:00:00Z'))).toBe(2027)
})

test('extraBlocksForSeason derives both shoulders from the era, not constants', () => {
  expect(extraBlocksForSeason({ startWeek: 21 })).toEqual({
    early: { firstWeek: 19, lastWeek: 20 },
    late: { firstWeek: 41, lastWeek: 42 },
  })
  // A convention change (ADR-0019 runbook) moves the shoulders with it.
  expect(extraBlocksForSeason({ startWeek: 23 })).toEqual({
    early: { firstWeek: 21, lastWeek: 22 },
    late: { firstWeek: 43, lastWeek: 44 },
  })
})

test('nominalSlotsForSeason seeds 12 slots: extra + 10 rotation + extra', () => {
  const slots = nominalSlotsForSeason(SEASON_2026)
  expect(slots).toHaveLength(12)
  expect(slots[0]).toEqual({ firstWeek: 19, lastWeek: 20, kind: 'extra', holder: null })
  expect(slots[1]).toEqual({ firstWeek: 21, lastWeek: 22, kind: 'rotation', holder: 'D' })
  expect(slots[10]).toEqual({ firstWeek: 39, lastWeek: 40, kind: 'rotation', holder: 'C' })
  expect(slots[11]).toEqual({ firstWeek: 41, lastWeek: 42, kind: 'extra', holder: null })
})
