import { expect, test } from 'vitest'
import { db } from '~/lib/db'
import { user } from '~/lib/db/schema'
import type { ShareCode } from '~/lib/shares/codes'
import {
  createSeason,
  defaultStartShareFor,
  defaultStartWeekFor,
  deleteSeason,
  findSeason,
  listSeasons,
  monthBandsForSeason,
  monthForISOWeek,
  partForWeek,
  scheduleForYear,
  updateSeason,
} from './season'
import { assignPart } from './share'

// Seeded by drizzle/0002_seed_initial_seasons.sql; each test starts with
// exactly these four rows in the `season` table.
const INITIAL_SEASONS: ReadonlyArray<{
  year: number
  startWeek: number
  startShare: ShareCode
}> = [
  { year: 2026, startWeek: 21, startShare: 'D' },
  { year: 2027, startWeek: 20, startShare: 'A' },
  { year: 2028, startWeek: 20, startShare: 'H' },
  { year: 2029, startWeek: 21, startShare: 'E' },
]

test('the migration-seeded seasons (2026..2029) are present in the season table', async () => {
  expect(await listSeasons()).toEqual(
    INITIAL_SEASONS.map((s) => ({
      year: s.year,
      startWeek: s.startWeek,
      startShare: s.startShare,
    })),
  )
})

test('createSeason without startShare uses the anchor when no prior year exists', async () => {
  // 2024 is not seeded, so it has no prior year to derive from.
  const s = await createSeason({ year: 2024, startWeek: 21 })
  expect(s).toMatchObject({ year: 2024, startWeek: 21, startShare: 'J' })
})

test('createSeason derives startShare from the prior year using the −3 rule', async () => {
  // Chain forward from the last seeded year (2029 = E). Each subsequent year
  // rotates by −3: E (4) → B (1) → I (8) → F (5).
  const y2030 = await createSeason({ year: 2030, startWeek: 21 })
  expect(y2030.startShare).toBe('B')

  const y2031 = await createSeason({ year: 2031, startWeek: 21 })
  expect(y2031.startShare).toBe('I')

  const y2032 = await createSeason({ year: 2032, startWeek: 21 })
  expect(y2032.startShare).toBe('F')
})

test('createSeason accepts an explicit startShare override', async () => {
  const s = await createSeason({ year: 2035, startWeek: 22, startShare: 'B' })
  expect(s.startShare).toBe('B')
})

test('defaultStartShareFor returns anchor for the very first year', async () => {
  expect(await defaultStartShareFor(2024)).toBe('J')
})

test('defaultStartShareFor rotates −3 from the seeded prior year', async () => {
  // 2029 is seeded as E; 2030 should derive to B.
  expect(await defaultStartShareFor(2030)).toBe('B')
})

test('updateSeason patches the provided fields and leaves others alone', async () => {
  const updated = await updateSeason(2026, { startWeek: 22 })
  expect(updated).toMatchObject({ year: 2026, startWeek: 22, startShare: 'D' })

  const repointed = await updateSeason(2026, { startShare: 'E' })
  expect(repointed.startShare).toBe('E')
})

test('deleteSeason removes the row', async () => {
  await deleteSeason(2027)
  expect(await findSeason(2027)).toBeNull()
})

test('listSeasons returns rows ordered by year ascending', async () => {
  await createSeason({ year: 2024, startWeek: 21, startShare: 'J' })
  await createSeason({ year: 2030, startWeek: 21, startShare: 'B' })

  expect((await listSeasons()).map((r) => r.year)).toEqual([2024, 2026, 2027, 2028, 2029, 2030])
})

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

test('scheduleForYear joins each weekly slot with the current owner', async () => {
  const [{ id: aliceId }, { id: bobId }] = await db
    .insert(user)
    .values([
      { name: 'Alice', email: 'alice@test.oceanview.local' },
      { name: 'Bob', email: 'bob@test.oceanview.local' },
    ])
    .returning({ id: user.id })
  await assignPart({ partId: 'D1', userId: aliceId, from: new Date('2020-01-01') })
  await assignPart({ partId: 'A1', userId: bobId, from: new Date('2020-01-01') })

  const schedule = await scheduleForYear(2026)
  if (!schedule) throw new Error('expected schedule for year 2026')
  expect(schedule).toHaveLength(20)

  const byWeek = new Map(schedule.map((e) => [e.week, e]))
  expect(byWeek.get(21)).toMatchObject({ partId: 'D1', userId: aliceId })
  expect(byWeek.get(22)).toMatchObject({ partId: 'D2', userId: null })
  expect(byWeek.get(35)).toMatchObject({ partId: 'A1', userId: bobId })
  expect(byWeek.get(40)).toMatchObject({ partId: 'C2', userId: null })
})

test('scheduleForYear returns null when no season is configured for that year', async () => {
  expect(await scheduleForYear(2099)).toBeNull()
})

test('each seeded year produces a schedule that starts at the expected share', async () => {
  for (const seed of INITIAL_SEASONS) {
    const schedule = await scheduleForYear(seed.year)
    if (!schedule) throw new Error(`expected schedule for year ${seed.year}`)
    expect(schedule[0]).toMatchObject({
      week: seed.startWeek,
      shareCode: seed.startShare,
      partNumber: 1,
      partId: `${seed.startShare}1`,
    })
  }
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

test('createSeason without startWeek defaults to the second-to-last week of May', async () => {
  // 2033 is fresh and not seeded; uses defaultStartWeekFor under the hood.
  const s = await createSeason({ year: 2033, startShare: 'A' })
  expect(s.startWeek).toBe(defaultStartWeekFor(2033))
})
