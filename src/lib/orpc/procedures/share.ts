import { z } from 'zod'
import { protectedProcedure } from '~/lib/orpc/context'
import * as shareService from '~/lib/services/share'

export const shareRouter = {
  // Current user's owned share parts. `years` scopes the query cache per
  // page state but does not affect the response — ownership changes
  // mid-season are rare enough that the *current* assignment set is applied
  // to every visible year on the client.
  listMine: protectedProcedure
    .input(z.object({ years: z.array(z.int()) }))
    .handler(({ context }) => shareService.listCurrentPartsForUser(context.user.id)),
}
