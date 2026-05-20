import { protectedProcedure } from '~/lib/orpc/context'
import * as seasonService from '~/lib/services/season'
import { WEEKS_PER_SEASON } from '~/lib/shares/codes'

export const seasonRouter = {
  // Returns every configured season together with its 20-week share mapping,
  // shaped for the read-only Disponeringslista grid. Skips ownership data on
  // purpose — the grid only needs the share letter per cell. Includes the
  // per-year month bands (computed from each year's actual calendar) so the
  // client can group cells under Maj/Jun/Jul/Aug/Sep/Okt without re-doing
  // the date math.
  listSchedules: protectedProcedure.handler(async () => {
    const seasons = await seasonService.listSeasons()
    return seasons.map((s) => {
      const cells = Array.from({ length: WEEKS_PER_SEASON }, (_, i) => {
        const week = s.startWeek + i
        const slot = seasonService.partForWeek(s, week)
        // Within [startWeek, startWeek + WEEKS_PER_SEASON) partForWeek always
        // resolves; this guard exists so a future change to WEEKS_PER_SEASON
        // can't silently produce nulls.
        if (!slot) {
          throw new Error(`partForWeek returned null for ${s.year} week ${week}`)
        }
        return {
          week,
          shareCode: slot.shareCode,
          partId: slot.partId,
          month: seasonService.monthForISOWeek(s.year, week),
        }
      })
      const monthBands = seasonService.monthBandsForSeason({
        year: s.year,
        startWeek: s.startWeek,
      })
      return { year: s.year, startWeek: s.startWeek, cells, monthBands }
    })
  }),
}
