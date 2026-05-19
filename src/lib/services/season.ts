import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { ownershipAssignment, season, sharePart } from '~/lib/db/schema'
import {
  ANCHOR_START_SHARE,
  DEFAULT_YEAR_ROTATION,
  PARTS_PER_SHARE,
  rotateShare,
  SHARE_CODES,
  type ShareCode,
  shareIndexOf,
  sharePartId,
  WEEKS_PER_SEASON,
} from '~/lib/shares/codes'

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
  startWeek: number
  startShare?: ShareCode
}

// If `startShare` isn't supplied we derive it from the previous year by
// rotating DEFAULT_YEAR_ROTATION steps (matches the historical pattern in the
// Disponeringslista). Falls back to ANCHOR_START_SHARE when no prior season
// exists.
export async function createSeason(input: CreateSeasonInput): Promise<SeasonRow> {
  const startShare = input.startShare ?? (await defaultStartShareFor(input.year))
  const [row] = await db
    .insert(season)
    .values({
      year: input.year,
      startWeek: input.startWeek,
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
  return row
}

export async function deleteSeason(year: number): Promise<void> {
  await db.delete(season).where(eq(season.year, year))
}

export type WeekSlot = {
  shareCode: ShareCode
  partNumber: 1 | 2
  partId: string
}

// Pure: returns the slot occupied at `isoWeek` within `season`, or null if
// the week sits outside the 20-week season window.
//
// Math: weeks 0..19 from startWeek map to share parts in stride 2, where
// odd offsets map to part 1 (the first week of a share) and even offsets
// map to part 2. The share itself advances by ⌊offset / 2⌋ positions from
// startShare, wrapping mod 10.
export function partForWeek(
  input: { startWeek: number; startShare: ShareCode },
  isoWeek: number,
): WeekSlot | null {
  const offset = isoWeek - input.startWeek
  if (offset < 0 || offset >= WEEKS_PER_SEASON) return null

  const partNumber = ((offset % PARTS_PER_SHARE) + 1) as 1 | 2
  const shareOffset = Math.floor(offset / PARTS_PER_SHARE)
  const shareIndex = (shareIndexOf(input.startShare) + shareOffset) % SHARE_CODES.length
  const shareCode = SHARE_CODES[shareIndex]
  return { shareCode, partNumber, partId: sharePartId(shareCode, partNumber) }
}

export type ScheduleEntry = {
  week: number
  shareCode: ShareCode
  partNumber: 1 | 2
  partId: string
  userId: string | null
}

// Returns the 20-week schedule for a given year with the current owner of
// each part left-joined in. Useful for the admin "Disponeringslista" grid.
export async function scheduleForYear(year: number): Promise<Array<ScheduleEntry> | null> {
  const s = await findSeason(year)
  if (!s) return null

  const owners = await db
    .select({ partId: sharePart.id, userId: ownershipAssignment.userId })
    .from(sharePart)
    .leftJoin(
      ownershipAssignment,
      and(eq(ownershipAssignment.partId, sharePart.id), isNull(ownershipAssignment.assignedTo)),
    )
  const ownerByPart = new Map(owners.map((r) => [r.partId, r.userId]))

  const entries: Array<ScheduleEntry> = []
  for (let i = 0; i < WEEKS_PER_SEASON; i++) {
    const week = s.startWeek + i
    const slot = partForWeek(s, week)
    if (!slot) continue
    entries.push({
      week,
      shareCode: slot.shareCode,
      partNumber: slot.partNumber,
      partId: slot.partId,
      userId: ownerByPart.get(slot.partId) ?? null,
    })
  }
  return entries
}
