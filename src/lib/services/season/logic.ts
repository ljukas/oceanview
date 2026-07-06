import { addDays, getMonth, parseISO } from 'date-fns'
import {
  DEFAULT_YEAR_ROTATION,
  rotateShare,
  SHARE_CODES,
  type ShareCode,
  shareIndexOf,
  WEEKS_PER_SEASON,
  WEEKS_PER_SHARE,
} from '~/lib/shares/codes'

// A season-convention era (ADR-0019): governs every season year >= fromYear
// until a later era takes over. Rows come from the append-only season_era
// table; everything in this file is pure and takes eras as arguments so it
// tests without a database.
export type SeasonEra = {
  fromYear: number
  startWeek: number
  startShare: ShareCode
}

export type ScheduleCell = {
  week: number
  shareCode: ShareCode
  month: number
}

// A whole-share block: the WEEKS_PER_SHARE consecutive weeks one share
// occupies (ADR-0018 — shares are indivisible, so this is the atomic
// calendar unit the UI renders).
export type ShareBlock = {
  firstWeek: number
  lastWeek: number
  shareCode: ShareCode
  span: number
}

export type YearSchedule = {
  year: number
  cells: Array<ScheduleCell>
  blocks: Array<ShareBlock>
  monthBands: Array<MonthBand>
}

// The era with the greatest fromYear <= year, or null for years before the
// first era (never rendered — buildSchedules starts at min(fromYear)).
export function eraForYear(eras: ReadonlyArray<SeasonEra>, year: number): SeasonEra | null {
  let match: SeasonEra | null = null
  for (const era of eras) {
    if (era.fromYear <= year && (match === null || era.fromYear > match.fromYear)) {
      match = era
    }
  }
  return match
}

// The schedule slips 6 weeks per season (DEFAULT_YEAR_ROTATION = -3 share
// positions per year), continuing from the era's anchor share.
export function startShareForYear(era: SeasonEra, year: number): ShareCode {
  return rotateShare(era.startShare, DEFAULT_YEAR_ROTATION * (year - era.fromYear))
}

// Resolves the two values a year's schedule needs from its governing era.
export function seasonForYear(
  eras: ReadonlyArray<SeasonEra>,
  year: number,
): { startWeek: number; startShare: ShareCode } | null {
  const era = eraForYear(eras, year)
  if (!era) return null
  return { startWeek: era.startWeek, startShare: startShareForYear(era, year) }
}

// Pure: returns the share occupying `isoWeek` within the season, or null if
// the week sits outside the 20-week window. Weeks map to shares in blocks of
// WEEKS_PER_SHARE consecutive weeks, advancing from startShare and wrapping
// mod 10.
export function shareForWeek(
  input: { startWeek: number; startShare: ShareCode },
  isoWeek: number,
): ShareCode | null {
  const offset = isoWeek - input.startWeek
  if (offset < 0 || offset >= WEEKS_PER_SEASON) return null

  const shareOffset = Math.floor(offset / WEEKS_PER_SHARE)
  const shareIndex = (shareIndexOf(input.startShare) + shareOffset) % SHARE_CODES.length
  return SHARE_CODES[shareIndex]
}

// Pure: chunks the season's weeks into whole-share blocks of
// WEEKS_PER_SHARE consecutive weeks from startWeek.
export function shareBlocksForSeason(input: {
  startWeek: number
  startShare: ShareCode
}): Array<ShareBlock> {
  const blocks: Array<ShareBlock> = []
  for (let offset = 0; offset < WEEKS_PER_SEASON; offset += WEEKS_PER_SHARE) {
    const firstWeek = input.startWeek + offset
    const shareCode = shareForWeek(input, firstWeek)
    // Unreachable within the loop bounds — same backstop rationale as the
    // cells loop in buildSchedules.
    if (!shareCode) {
      throw new Error(`shareForWeek returned null for week ${firstWeek}`)
    }
    blocks.push({
      firstWeek,
      lastWeek: firstWeek + WEEKS_PER_SHARE - 1,
      shareCode,
      span: WEEKS_PER_SHARE,
    })
  }
  return blocks
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

// One YearSchedule per year from min(fromYear) through currentYear + 1 —
// full history plus next season for planning (ADR-0019).
export function buildSchedules(
  eras: ReadonlyArray<SeasonEra>,
  currentYear: number,
): Array<YearSchedule> {
  if (eras.length === 0) return []
  const firstYear = Math.min(...eras.map((e) => e.fromYear))
  const lastYear = currentYear + 1

  const schedules: Array<YearSchedule> = []
  for (let year = firstYear; year <= lastYear; year++) {
    const season = seasonForYear(eras, year)
    // Unreachable within [firstYear, lastYear] — firstYear is an era's
    // fromYear — but keeps the loop total if the range logic ever changes.
    if (!season) continue

    const cells = Array.from({ length: WEEKS_PER_SEASON }, (_, i) => {
      const week = season.startWeek + i
      const shareCode = shareForWeek(season, week)
      // Within [startWeek, startWeek + WEEKS_PER_SEASON) shareForWeek always
      // resolves; this guard exists so a future change to WEEKS_PER_SEASON
      // can't silently produce nulls.
      if (!shareCode) {
        throw new Error(`shareForWeek returned null for ${year} week ${week}`)
      }
      return { week, shareCode, month: monthForISOWeek(year, week) }
    })

    schedules.push({
      year,
      cells,
      blocks: shareBlocksForSeason(season),
      monthBands: monthBandsForSeason({ year, startWeek: season.startWeek }),
    })
  }
  return schedules
}
