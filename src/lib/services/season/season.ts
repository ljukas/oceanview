import { asc, eq, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { ownershipAssignment, season } from '~/lib/db/schema'
import {
  ANCHOR_START_SHARE,
  DEFAULT_YEAR_ROTATION,
  rotateShare,
  type ShareCode,
  WEEKS_PER_SEASON,
} from '~/lib/shares/codes'
import { SeasonDomainError } from './errors'
import { shareForWeek } from './logic'

// The co-ownership group's fixed convention: every season starts on ISO
// week 21. Soft rule per ADR-0009 Rule 2 — defaulted here and treated as a
// pre-fill in the admin dialog, but the service still accepts an override
// on the rare occasion an admin needs one.
export const SEASON_START_WEEK = 21

export type SeasonRow = {
  year: number
  startWeek: number
  startShare: ShareCode
}

const seasonSelection = {
  year: season.year,
  startWeek: season.startWeek,
  startShare: season.startShare,
}

export async function listSeasons(): Promise<Array<SeasonRow>> {
  return db.select(seasonSelection).from(season).orderBy(asc(season.year))
}

export async function findSeason(year: number): Promise<SeasonRow | null> {
  const [row] = await db.select(seasonSelection).from(season).where(eq(season.year, year)).limit(1)
  return row ?? null
}

export type CreateSeasonInput = {
  year: number
  startWeek?: number
  startShare?: ShareCode
}

// `startShare` defaults to the previous year rotated by DEFAULT_YEAR_ROTATION
// (or ANCHOR_START_SHARE when no prior season exists). `startWeek` defaults
// to SEASON_START_WEEK; an explicit override is passed through unchanged.
//
// Check-first invariant (ADR-0002): an explicit existence read raises the
// domain error; we never inspect Postgres error codes or messages. The
// unique constraint on `year` stays as a backstop — a racing duplicate
// insert surfaces as a raw DB error, accepted at this scale.
export async function createSeason(input: CreateSeasonInput): Promise<SeasonRow> {
  if (await findSeason(input.year)) throw new SeasonDomainError('ALREADY_EXISTS')
  const startShare = input.startShare ?? (await defaultStartShareFor(input.year))
  const startWeek = input.startWeek ?? SEASON_START_WEEK
  const [row] = await db
    .insert(season)
    .values({
      year: input.year,
      startWeek,
      startShare,
    })
    .returning(seasonSelection)
  return row
}

export async function defaultStartShareFor(year: number): Promise<ShareCode> {
  const prev = await findSeason(year - 1)
  if (!prev) return ANCHOR_START_SHARE
  return rotateShare(prev.startShare, DEFAULT_YEAR_ROTATION)
}

export type UpdateSeasonInput = Partial<{
  startWeek: number
  startShare: ShareCode
}>

export async function updateSeason(year: number, patch: UpdateSeasonInput): Promise<SeasonRow> {
  const [row] = await db
    .update(season)
    .set(patch)
    .where(eq(season.year, year))
    .returning(seasonSelection)
  if (!row) throw new SeasonDomainError('NOT_FOUND')
  return row
}

export async function deleteSeason(year: number): Promise<void> {
  await db.delete(season).where(eq(season.year, year))
}

export type ScheduleEntry = {
  week: number
  shareCode: ShareCode
  userId: string | null
}

// Returns the 20-week schedule for a given year with the current owner of
// each share left-joined in. Useful for the admin "Disponeringslista" grid.
export async function scheduleForYear(year: number): Promise<Array<ScheduleEntry> | null> {
  const s = await findSeason(year)
  if (!s) return null

  const owners = await db
    .select({ shareCode: ownershipAssignment.shareCode, userId: ownershipAssignment.userId })
    .from(ownershipAssignment)
    .where(isNull(ownershipAssignment.assignedTo))
  const ownerByShare = new Map(owners.map((r) => [r.shareCode, r.userId]))

  const entries: Array<ScheduleEntry> = []
  for (let i = 0; i < WEEKS_PER_SEASON; i++) {
    const week = s.startWeek + i
    const shareCode = shareForWeek(s, week)
    if (!shareCode) continue
    entries.push({ week, shareCode, userId: ownerByShare.get(shareCode) ?? null })
  }
  return entries
}
