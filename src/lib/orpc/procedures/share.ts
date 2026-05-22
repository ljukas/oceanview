import { protectedProcedure } from '~/lib/orpc/context'
import * as shareService from '~/lib/services/share'

export const shareRouter = {
  // Current user's owned share parts. The same assignment set is applied to
  // every visible year on the client — ownership changes mid-season are rare.
  listMine: protectedProcedure.handler(({ context }) =>
    shareService.listCurrentPartsForUser(context.user.id),
  ),
}
