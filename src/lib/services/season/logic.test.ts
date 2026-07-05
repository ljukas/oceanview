import { expect, test } from 'vitest'
import { DEFAULT_YEAR_ROTATION, rotateShare } from '~/lib/shares/codes'
import { monthBandsForSeason, monthForISOWeek, shareForWeek } from './season'

test('shareForWeek reproduces the 2026 row from the Disponeringslista', () => {
  const s = { startWeek: 21, startShare: 'D' as const }
  const expected: Array<readonly [number, string]> = [
    [21, 'D'],
    [22, 'D'],
    [23, 'E'],
    [24, 'E'],
    [25, 'F'],
    [26, 'F'],
    [27, 'G'],
    [28, 'G'],
    [29, 'H'],
    [30, 'H'],
    [31, 'I'],
    [32, 'I'],
    [33, 'J'],
    [34, 'J'],
    [35, 'A'],
    [36, 'A'],
    [37, 'B'],
    [38, 'B'],
    [39, 'C'],
    [40, 'C'],
  ]
  for (const [week, shareCode] of expected) {
    expect(shareForWeek(s, week)).toBe(shareCode)
  }
})

test('shareForWeek returns null for weeks outside the 20-week window', () => {
  const s = { startWeek: 21, startShare: 'D' as const }
  expect(shareForWeek(s, 20)).toBeNull()
  expect(shareForWeek(s, 41)).toBeNull()
  // First and last in-window weeks are still valid.
  expect(shareForWeek(s, 21)).toBe('D')
  expect(shareForWeek(s, 40)).toBe('C')
})

test('default year rotation slips every share 6 weeks (ADR-0018)', () => {
  // Year 1: startShare A → share A owns weeks 21/22.
  const y1 = { startWeek: 21, startShare: 'A' as const }
  expect(shareForWeek(y1, 21)).toBe('A')
  expect(shareForWeek(y1, 22)).toBe('A')

  // Year 2 via the default rotation: A slips to weeks 27/28.
  const y2 = { startWeek: 21, startShare: rotateShare('A', DEFAULT_YEAR_ROTATION) }
  expect(y2.startShare).toBe('H')
  expect(shareForWeek(y2, 27)).toBe('A')
  expect(shareForWeek(y2, 28)).toBe('A')
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
  // Logic check for the rare override case: when a season starts at W20
  // instead of the canonical W21 (ADR-0009 Rule 2 is a soft default), the
  // 20-week window ends at W39 and stays inside September.
  const bands = monthBandsForSeason({ year: 2027, startWeek: 20 })
  expect(bands).toEqual([
    { month: 4, firstWeek: 20, lastWeek: 21, span: 2 },
    { month: 5, firstWeek: 22, lastWeek: 25, span: 4 },
    { month: 6, firstWeek: 26, lastWeek: 30, span: 5 },
    { month: 7, firstWeek: 31, lastWeek: 34, span: 4 },
    { month: 8, firstWeek: 35, lastWeek: 39, span: 5 },
  ])
})
