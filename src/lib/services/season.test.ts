import { beforeEach, expect, test } from 'vitest'
import { db } from '~/lib/db'
import { user } from '~/lib/db/schema'
import { INITIAL_SEASONS, truncateAll } from '../../../test/setup'
import {
  createSeason,
  defaultStartShareFor,
  deleteSeason,
  findSeason,
  listSeasons,
  partForWeek,
  scheduleForYear,
  updateSeason,
} from './season'
import { assignPart } from './share'

beforeEach(async () => {
  await truncateAll()
})

test('the migration-seeded seasons (2026..2029) are present after truncate', async () => {
  const rows = await listSeasons()
  expect(rows).toEqual(
    INITIAL_SEASONS.map((s) => ({
      year: s.year,
      startWeek: s.startWeek,
      startShare: s.startShare,
    })),
  )
})

test('createSeason without startShare uses the anchor when no prior year exists', async () => {
  // 2023 is not seeded, so 2024 has no prior year to derive from.
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

  const rows = await listSeasons()
  expect(rows.map((r) => r.year)).toEqual([2024, 2026, 2027, 2028, 2029, 2030])
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
  await db.insert(user).values([
    { id: 'u-alice', name: 'Alice', email: 'alice@example.com' },
    { id: 'u-bob', name: 'Bob', email: 'bob@example.com' },
  ])
  await assignPart({ partId: 'D1', userId: 'u-alice', from: new Date('2020-01-01') })
  await assignPart({ partId: 'A1', userId: 'u-bob', from: new Date('2020-01-01') })

  const schedule = await scheduleForYear(2026)
  if (!schedule) throw new Error('expected schedule for year 2026')
  expect(schedule).toHaveLength(20)

  const byWeek = new Map(schedule.map((e) => [e.week, e]))
  expect(byWeek.get(21)).toMatchObject({ partId: 'D1', userId: 'u-alice' })
  expect(byWeek.get(22)).toMatchObject({ partId: 'D2', userId: null })
  expect(byWeek.get(35)).toMatchObject({ partId: 'A1', userId: 'u-bob' })
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
