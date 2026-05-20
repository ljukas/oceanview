import { expect, test } from 'vitest'
import { db } from '~/lib/db'
import { user } from '~/lib/db/schema'
import type { ShareCode } from '~/lib/shares/codes'
import { setupDatabase } from '~test/setup'
import {
  createSeason,
  defaultStartShareFor,
  defaultStartWeekFor,
  deleteSeason,
  findSeason,
  listSeasons,
  scheduleForYear,
  updateSeason,
} from './season'
import { assignPart } from './share'

setupDatabase()

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

async function seedInitialSeasons() {
  for (const s of INITIAL_SEASONS) {
    await createSeason(s)
  }
}

test('createSeason without startShare uses the anchor when no prior year exists', async () => {
  const s = await createSeason({ year: 2024, startWeek: 21 })
  expect(s).toMatchObject({ year: 2024, startWeek: 21, startShare: 'J' })
})

test('createSeason derives startShare from the prior year using the −3 rule', async () => {
  // Chain forward from 2029 = E. Each subsequent year rotates by −3:
  // E (4) → B (1) → I (8) → F (5).
  await createSeason({ year: 2029, startWeek: 21, startShare: 'E' })

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

test('defaultStartShareFor rotates −3 from the prior year', async () => {
  await createSeason({ year: 2029, startWeek: 21, startShare: 'E' })
  expect(await defaultStartShareFor(2030)).toBe('B')
})

test('updateSeason patches the provided fields and leaves others alone', async () => {
  await createSeason({ year: 2026, startWeek: 21, startShare: 'D' })

  const updated = await updateSeason(2026, { startWeek: 22 })
  expect(updated).toMatchObject({ year: 2026, startWeek: 22, startShare: 'D' })

  const repointed = await updateSeason(2026, { startShare: 'E' })
  expect(repointed.startShare).toBe('E')
})

test('deleteSeason removes the row', async () => {
  await createSeason({ year: 2027, startWeek: 20, startShare: 'A' })
  await deleteSeason(2027)
  expect(await findSeason(2027)).toBeNull()
})

test('listSeasons returns rows ordered by year ascending', async () => {
  await seedInitialSeasons()
  await createSeason({ year: 2024, startWeek: 21, startShare: 'J' })
  await createSeason({ year: 2030, startWeek: 21, startShare: 'B' })

  expect((await listSeasons()).map((r) => r.year)).toEqual([2024, 2026, 2027, 2028, 2029, 2030])
})

test('scheduleForYear joins each weekly slot with the current owner', async () => {
  await createSeason({ year: 2026, startWeek: 21, startShare: 'D' })
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

test('each initial year produces a schedule that starts at the expected share', async () => {
  await seedInitialSeasons()
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

test('createSeason without startWeek defaults to the second-to-last week of May', async () => {
  // 2033 is fresh and not seeded; uses defaultStartWeekFor under the hood.
  const s = await createSeason({ year: 2033, startShare: 'A' })
  expect(s.startWeek).toBe(defaultStartWeekFor(2033))
})
