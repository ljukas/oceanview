import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { auth } from '~/lib/auth'
import { adminProcedure, protectedProcedure } from '~/lib/orpc/context'
import * as userService from '~/lib/services/user'

const roleSchema = z.enum(['user', 'admin'])

const userInputSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().min(5).max(30),
  role: roleSchema,
})

export const userRouter = {
  me: protectedProcedure.handler(({ context }) => context.user),

  findIdByEmail: adminProcedure
    .input(z.object({ email: z.email() }))
    .handler(({ input }) => userService.findIdByEmail(input.email)),

  setAdmin: adminProcedure
    .input(z.object({ id: z.string() }))
    .handler(({ input }) => userService.setAdmin(input.id)),

  list: adminProcedure
    .input(z.object({ filter: z.enum(['active', 'deleted']).default('active') }))
    .handler(({ input }) =>
      input.filter === 'deleted' ? userService.listDeleted() : userService.listAll(),
    ),

  getById: adminProcedure.input(z.object({ id: z.string().min(1) })).handler(async ({ input }) => {
    const target = await userService.findById(input.id)
    if (!target || target.deletedAt) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Användaren hittades inte',
      })
    }
    return target
  }),

  create: adminProcedure
    .input(userInputSchema)
    .handler(({ input }) => userService.createUser({ id: crypto.randomUUID(), ...input })),

  update: adminProcedure
    .input(userInputSchema.extend({ id: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      const target = await userService.findById(input.id)
      if (!target) {
        throw new ORPCError('NOT_FOUND', { message: 'Användaren hittades inte' })
      }
      if (target.deletedAt) {
        throw new ORPCError('CONFLICT', {
          message: 'Användaren är borttagen och kan inte ändras',
        })
      }

      const demotingSelf = input.id === context.user.id && input.role !== 'admin'
      if (demotingSelf) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Du kan inte degradera dig själv',
        })
      }

      const demotingAdmin = target.role === 'admin' && input.role !== 'admin'
      if (demotingAdmin) {
        const admins = await userService.countAdmins()
        if (admins <= 1) {
          throw new ORPCError('CONFLICT', {
            message: 'Det måste finnas minst en administratör',
          })
        }
      }

      return userService.updateUser(input.id, {
        name: input.name,
        email: input.email,
        phone: input.phone,
        role: input.role,
      })
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      if (input.id === context.user.id) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Du kan inte radera dig själv',
        })
      }

      const target = await userService.findById(input.id)
      if (!target) {
        throw new ORPCError('NOT_FOUND', { message: 'Användaren hittades inte' })
      }
      if (target.deletedAt) {
        return
      }

      if (target.role === 'admin') {
        const admins = await userService.countAdmins()
        if (admins <= 1) {
          throw new ORPCError('CONFLICT', {
            message: 'Det måste finnas minst en administratör',
          })
        }
      }

      await userService.softDeleteUser(input.id)
      await auth.api.revokeUserSessions({
        body: { userId: input.id },
        headers: context.headers,
      })
    }),

  restore: adminProcedure.input(z.object({ id: z.string().min(1) })).handler(async ({ input }) => {
    const target = await userService.findById(input.id)
    if (!target) {
      throw new ORPCError('NOT_FOUND', { message: 'Användaren hittades inte' })
    }
    if (!target.deletedAt) return
    await userService.restoreUser(input.id)
  }),
}
