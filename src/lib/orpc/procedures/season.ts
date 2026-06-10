import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { realtime } from '~/lib/effects'
import { adminProcedure, protectedProcedure } from '~/lib/orpc/context'
import * as seasonService from '~/lib/services/season'
import { SeasonDomainError } from '~/lib/services/season'
import { SHARE_CODES, WEEKS_PER_SEASON } from '~/lib/shares/codes'

function rethrowAsORPC(err: unknown): never {
  if (!(err instanceof SeasonDomainError)) throw err
  switch (err.code) {
    case 'ALREADY_EXISTS':
      throw new ORPCError('CONFLICT', { message: 'Säsongen finns redan' })
    case 'NOT_FOUND':
      throw new ORPCError('NOT_FOUND', { message: 'Säsongen hittades inte' })
  }
}

const seasonYearSchema = z.object({ year: z.number().int().min(2020).max(2100) })

const createSeasonSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  startWeek: z.number().int().min(1).max(53),
  startShare: z.enum(SHARE_CODES),
})

const updateSeasonSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  startWeek: z.number().int().min(1).max(53),
  startShare: z.enum(SHARE_CODES),
})

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

  // Defaults the "Ny säsong" dialog pre-fills. The next year is max(year) +
  // 1, or the current calendar year when no seasons exist. The start week
  // is the SEASON_START_WEEK constant (ADR-0009 Rule 2). The start share
  // rotates −3 from the prior year.
  suggestedNext: adminProcedure.handler(async () => {
    const existing = await seasonService.listSeasons()
    const year =
      existing.length === 0
        ? new Date().getFullYear()
        : Math.max(...existing.map((s) => s.year)) + 1
    const startShare = await seasonService.defaultStartShareFor(year)
    return { year, startWeek: seasonService.SEASON_START_WEEK, startShare }
  }),

  create: adminProcedure.input(createSeasonSchema).handler(async ({ input, context }) => {
    let created: Awaited<ReturnType<typeof seasonService.createSeason>>
    try {
      created = await seasonService.createSeason(input)
    } catch (err) {
      rethrowAsORPC(err)
    }
    context.log.info('admin created season', { year: created.year })
    await realtime.publish({ kind: 'season.changed' }, { source: context.user.id })
    return created
  }),

  getByYear: adminProcedure.input(seasonYearSchema).handler(async ({ input }) => {
    const row = await seasonService.findSeason(input.year)
    if (!row) throw new ORPCError('NOT_FOUND', { message: 'Säsongen hittades inte' })
    return row
  }),

  update: adminProcedure.input(updateSeasonSchema).handler(async ({ input, context }) => {
    let updated: Awaited<ReturnType<typeof seasonService.updateSeason>>
    try {
      updated = await seasonService.updateSeason(input.year, {
        startWeek: input.startWeek,
        startShare: input.startShare,
      })
    } catch (err) {
      rethrowAsORPC(err)
    }
    context.log.info('admin updated season', { year: input.year })
    await realtime.publish({ kind: 'season.changed' }, { source: context.user.id })
    return updated
  }),

  delete: adminProcedure.input(seasonYearSchema).handler(async ({ input, context }) => {
    await seasonService.deleteSeason(input.year)
    context.log.info('admin deleted season', { year: input.year })
    await realtime.publish({ kind: 'season.changed' }, { source: context.user.id })
  }),
}
