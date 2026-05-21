import { expect, test } from 'vitest'
import { defaultStartWeekFor, monthBandsForSeason, monthForISOWeek, partForWeek } from './season'

test('partForWeek reproduces the 2026 row from the Disponeringslista', () => {
  const s = { startWeek: 21, startShare: 'D' as const }
  const expected: Array<readonly [number, string]> = [
    [21, 'D1'],
    [22, 'D2'],
    [23, 'E1'],
    [24, 'E2'],
    [25, 'F1'],
    [26, 'F2'],
    [27, 'G1'],
    [28, 'G2'],
    [29, 'H1'],
    [30, 'H2'],
    [31, 'I1'],
    [32, 'I2'],
    [33, 'J1'],
    [34, 'J2'],
    [35, 'A1'],
    [36, 'A2'],
    [37, 'B1'],
    [38, 'B2'],
    [39, 'C1'],
    [40, 'C2'],
  ]
  for (const [week, partId] of expected) {
    expect(partForWeek(s, week)?.partId).toBe(partId)
  }
})

test('partForWeek returns null for weeks outside the 20-week window', () => {
  const s = { startWeek: 21, startShare: 'D' as const }
  expect(partForWeek(s, 20)).toBeNull()
  expect(partForWeek(s, 41)).toBeNull()
  // First and last in-window weeks are still valid.
  expect(partForWeek(s, 21)?.partId).toBe('D1')
  expect(partForWeek(s, 40)?.partId).toBe('C2')
})

test('defaultStartWeekFor returns the second-to-last ISO week of May per year', () => {
  // Calendar-verified per year. ISO weeks belong to the month containing
  // their Thursday, so the rule yields W20 in years where May 31 falls on
  // Mon/Tue/Wed (the last May Thursday is one week earlier than usual,
  // shifting the anchor down by 1).
  expect(defaultStartWeekFor(2024)).toBe(21)
  expect(defaultStartWeekFor(2025)).toBe(21)
  expect(defaultStartWeekFor(2026)).toBe(21)
  expect(defaultStartWeekFor(2027)).toBe(20) // May 31 falls Monday
  expect(defaultStartWeekFor(2028)).toBe(20) // May 31 falls Wednesday
  expect(defaultStartWeekFor(2029)).toBe(21)
  expect(defaultStartWeekFor(2030)).toBe(21)
  expect(defaultStartWeekFor(2031)).toBe(21)
  expect(defaultStartWeekFor(2032)).toBe(21)
  expect(defaultStartWeekFor(2033)).toBe(20) // May 31 falls Tuesday
  expect(defaultStartWeekFor(2034)).toBe(20) // May 31 falls Wednesday
})

test('monthForISOWeek follows the ISO Thursday-month rule', () => {
  // 2026 — Thursday of W21 is May 21 → Maj.
  expect(monthForISOWeek(2026, 21)).toBe(4)
  expect(monthForISOWeek(2026, 22)).toBe(4)
  // W23 of 2026: Thu Jun 4 → Jun.
  expect(monthForISOWeek(2026, 23)).toBe(5)
  // W40 of 2026: Thu Oct 1 → Okt.
  expect(monthForISOWeek(2026, 40)).toBe(9)

  // 2027 — boundary case: W22 has Mon May 31 / Thu Jun 3 → Jun.
  expect(monthForISOWeek(2027, 22)).toBe(5)
  // W21 of 2027: Thu May 27 → Maj.
  expect(monthForISOWeek(2027, 21)).toBe(4)
})

test('monthBandsForSeason produces the 2026 split 2/4/5/4/4/1 across Maj..Okt', () => {
  const bands = monthBandsForSeason({ year: 2026, startWeek: 21 })
  expect(bands).toEqual([
    { month: 4, firstWeek: 21, lastWeek: 22, span: 2 },
    { month: 5, firstWeek: 23, lastWeek: 26, span: 4 },
    { month: 6, firstWeek: 27, lastWeek: 31, span: 5 },
    { month: 7, firstWeek: 32, lastWeek: 35, span: 4 },
    { month: 8, firstWeek: 36, lastWeek: 39, span: 4 },
    { month: 9, firstWeek: 40, lastWeek: 40, span: 1 },
  ])
})

test('monthBandsForSeason for 2027 (startWeek=20) covers Maj..Sep with no October overflow', () => {
  // With the corrected anchor rule 2027 starts a week earlier (W20), so the
  // 20-week season ends at W39 and stays inside September.
  const bands = monthBandsForSeason({ year: 2027, startWeek: 20 })
  expect(bands).toEqual([
    { month: 4, firstWeek: 20, lastWeek: 21, span: 2 },
    { month: 5, firstWeek: 22, lastWeek: 25, span: 4 },
    { month: 6, firstWeek: 26, lastWeek: 30, span: 5 },
    { month: 7, firstWeek: 31, lastWeek: 34, span: 4 },
    { month: 8, firstWeek: 35, lastWeek: 39, span: 5 },
  ])
})
