import { z } from 'zod'
import { adminProcedure, protectedProcedure } from '~/lib/orpc/context'
import * as userService from '~/lib/services/user'

export const userRouter = {
  me: protectedProcedure.handler(({ context }) => context.user),
  findIdByEmail: adminProcedure
    .input(z.object({ email: z.email() }))
    .handler(({ input }) => userService.findIdByEmail(input.email)),
  setAdmin: adminProcedure
    .input(z.object({ id: z.string() }))
    .handler(({ input }) => userService.setAdmin(input.id)),
}
