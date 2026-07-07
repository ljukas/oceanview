import { getISOWeek, getISOWeekYear } from 'date-fns'
import { shareBlocksForSeason } from '~/lib/services/season/logic'
import {
  SHARE_CODES,
  type ShareCode,
  WEEKS_PER_SEASON,
  WEEKS_PER_SHARE,
} from '~/lib/shares/codes'

// Pure booking-round logic (ADR-0020): era-fed, no DB — mirrors
// services/season/logic.ts. The service (booking.ts) feeds it rows.

export type BookingTarget = 'share' | 'extra_early' | 'extra_late'
export type SlotKind = 'rotation' | 'extra'

// One concrete-week slot of the 12-slot round: early extra, ten rotation
// blocks, late extra. Week numbers are stored, never derived at read time
// (ADR-0019 revisit trigger, consumed by ADR-0020).
export type Slot = {
  firstWeek: number
  lastWeek: number
  kind: SlotKind
  holder: ShareCode | null
}

export type WishInput = {
  shareCode: ShareCode
  targetKind: BookingTarget
  targetShare: ShareCode | null
}

// Deliberately a constant, not era math: deriving "the week after the late
// extra ends" needs the governing era, which needs the year — circular.
// ADR-0020 (product decision 2) fixed the flip at ISO week 43
// (= 21 + 20 + 2 under the 2024 era). Revisit with any era convention change.
const ACTIVE_FLIP_WEEK = 43

// The season year the single active round targets: year Y from the start of
// ISO week 43 of Y−1 (right after the late extra ends) until the start of
// ISO week 43 of Y. The ISO week-numbering year makes the early-January
// edge (Jan 1 falling in week 52/53 of the old year) resolve correctly.
export function activeSeasonYearFor(date: Date): number {
  const isoYear = getISOWeekYear(date)
  return getISOWeek(date) >= ACTIVE_FLIP_WEEK ? isoYear + 1 : isoYear
}

export type ExtraBlocks = {
  early: { firstWeek: number; lastWeek: number }
  late: { firstWeek: number; lastWeek: number }
}

// The two shoulder blocks, derived from the governing era so they follow a
// future convention change (week numbers 19/41 appear nowhere in code):
// one WEEKS_PER_SHARE-wide block ending just before startWeek and one
// starting just after the last rotation block.
export function extraBlocksForSeason(season: { startWeek: number }): ExtraBlocks {
  return {
    early: {
      firstWeek: season.startWeek - WEEKS_PER_SHARE,
      lastWeek: season.startWeek - 1,
    },
    late: {
      firstWeek: season.startWeek + WEEKS_PER_SEASON,
      lastWeek: season.startWeek + WEEKS_PER_SEASON + WEEKS_PER_SHARE - 1,
    },
  }
}

// The 12 seed slots: early extra (holder NULL), the ten rotation blocks
// (nominal holders), late extra (holder NULL). Ordered by firstWeek.
export function nominalSlotsForSeason(season: {
  startWeek: number
  startShare: ShareCode
}): Array<Slot> {
  const extras = extraBlocksForSeason(season)
  return [
    { ...extras.early, kind: 'extra' as const, holder: null },
    ...shareBlocksForSeason(season).map((block) => ({
      firstWeek: block.firstWeek,
      lastWeek: block.lastWeek,
      kind: 'rotation' as const,
      holder: block.shareCode,
    })),
    { ...extras.late, kind: 'extra' as const, holder: null },
  ]
}
