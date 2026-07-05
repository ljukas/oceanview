import { asc } from 'drizzle-orm'
import { db } from '~/lib/db'
import { season } from '~/lib/db/schema'
import type { ShareCode } from '~/lib/shares/codes'

export type SeasonRow = {
  year: number
  startWeek: number
  startShare: ShareCode
}

export async function listSeasons(): Promise<Array<SeasonRow>> {
  return db
    .select({
      year: season.year,
      startWeek: season.startWeek,
      startShare: season.startShare,
    })
    .from(season)
    .orderBy(asc(season.year))
}
