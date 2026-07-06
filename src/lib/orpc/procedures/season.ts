import { protectedProcedure } from '~/lib/orpc/context'
import * as seasonService from '~/lib/services/season'

export const seasonRouter = {
  // The Disponeringslista read (ADR-0019): every season is computed from its
  // governing era — no per-year rows, no mutations, no errors. Skips
  // ownership data on purpose; the grid only needs the share letter per cell.
  listSchedules: protectedProcedure.handler(async () => {
    const eras = await seasonService.listEras()
    return seasonService.buildSchedules(eras, new Date().getFullYear())
  }),
}
