import { addDays, getMonth, parseISO } from 'date-fns'
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
import { SeasonDomainError } from './errors'

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

// Pure: 0-indexed calendar month of the given ISO week, per the ISO 8601
// rule (the month containing the Thursday of that week). 4 = Maj, 9 = Okt.
export function monthForISOWeek(isoYear: number, isoWeek: number): number {
  const monday = parseISO(`${isoYear}-W${String(isoWeek).padStart(2, '0')}-1`)
  const thursday = addDays(monday, 3)
  return getMonth(thursday)
}

export type MonthBand = {
  month: number
  firstWeek: number
  lastWeek: number
  span: number
}

// Pure: collapses the 20 season weeks into contiguous same-month bands.
// Each band carries its calendar month (0-indexed), the inclusive week
// range, and the span (so callers can drive `<td colSpan>` directly).
export function monthBandsForSeason(input: { year: number; startWeek: number }): Array<MonthBand> {
  const bands: Array<MonthBand> = []
  for (let i = 0; i < WEEKS_PER_SEASON; i++) {
    const week = input.startWeek + i
    const month = monthForISOWeek(input.year, week)
    const last = bands[bands.length - 1]
    if (last && last.month === month) {
      last.lastWeek = week
      last.span += 1
    } else {
      bands.push({ month, firstWeek: week, lastWeek: week, span: 1 })
    }
  }
  return bands
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
