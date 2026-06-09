import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { auth } from '~/lib/auth'
import { realtime } from '~/lib/effects'
import { adminProcedure, protectedProcedure } from '~/lib/orpc/context'
import type { SharePartRow } from '~/lib/services/share'
import * as shareService from '~/lib/services/share'
import * as userService from '~/lib/services/user'
import { UserDomainError } from '~/lib/services/user'

function surnameKey(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.at(-1) ?? name
}

const roleSchema = z.enum(['user', 'admin'])

const userInputSchema = z.object({
  name: z.string(),
  email: z
    .email({ error: 'Ange en giltig e-postadress' })
    .min(1, { error: 'Ange en e-postadress' }),
  phone: z
    .string()
    .max(30, { error: 'Telefonnumret är för långt (max 30 tecken)' })
    .refine((v) => v === '' || v.length >= 5, {
      error: 'Telefonnumret är för kort (minst 5 tecken)',
    }),
  role: roleSchema,
})

function rethrowAsORPC(err: unknown, context: 'update' | 'delete' | 'restore'): never {
  if (!(err instanceof UserDomainError)) throw err
  switch (err.code) {
    case 'NOT_FOUND':
      throw new ORPCError('NOT_FOUND', { message: 'Användaren hittades inte' })
    case 'TARGET_DELETED':
      throw new ORPCError('CONFLICT', {
        message: 'Användaren är borttagen och kan inte ändras',
      })
    case 'CANNOT_ACT_ON_SELF':
      throw new ORPCError('FORBIDDEN', {
        message:
          context === 'delete' ? 'Du kan inte radera dig själv' : 'Du kan inte degradera dig själv',
      })
    case 'LAST_ADMIN':
      throw new ORPCError('CONFLICT', {
        message: 'Det måste finnas minst en administratör',
      })
  }
}

export const userRouter = {
  me: protectedProcedure.handler(async ({ context }) => {
    const fresh = await auth.api.getSession({
      headers: context.headers,
      query: { disableCookieCache: true },
    })
    return fresh?.user ?? context.user
  }),

  findIdByEmail: adminProcedure
    .input(z.object({ email: z.email() }))
    .handler(({ input }) => userService.findIdByEmail(input.email)),

  list: adminProcedure
    .input(z.object({ filter: z.enum(['active', 'deleted']).default('active') }))
    .handler(({ input }) =>
      input.filter === 'deleted' ? userService.listDeleted() : userService.listAll(),
    ),

  listContacts: protectedProcedure.handler(async () => {
    const [users, partsWithOwner] = await Promise.all([
      userService.listAll(),
      shareService.listPartsWithCurrentOwner(),
    ])

    const byUser = new Map<string, Array<SharePartRow>>()
    for (const p of partsWithOwner) {
      if (!p.currentUserId) continue
      const list = byUser.get(p.currentUserId) ?? []
      list.push({ id: p.id, shareCode: p.shareCode, partNumber: p.partNumber })
      byUser.set(p.currentUserId, list)
    }

    return users
      .map((u) => ({ ...u, shares: byUser.get(u.id) ?? [] }))
      .sort(
        (a, b) =>
          surnameKey(a.name).localeCompare(surnameKey(b.name), 'sv-SE') ||
          a.name.localeCompare(b.name, 'sv-SE'),
      )
  }),

  getById: adminProcedure.input(z.object({ id: z.uuid() })).handler(async ({ input }) => {
    const target = await userService.findActiveById(input.id)
    if (!target) {
      throw new ORPCError('NOT_FOUND', { message: 'Användaren hittades inte' })
    }
    return target
  }),

  create: adminProcedure.input(userInputSchema).handler(async ({ input, context }) => {
    const created = await userService.createAsAdmin(input)
    context.log.info('admin created user', { targetId: created.id, role: input.role })
    await realtime.publish({ kind: 'user.changed', ids: [created.id] }, { source: context.user.id })
    return created
  }),

  update: adminProcedure
    .input(userInputSchema.extend({ id: z.uuid() }))
    .handler(async ({ input, context }) => {
      try {
        const updated = await userService.updateAsAdmin(context.user.id, input.id, {
          name: input.name,
          email: input.email,
          phone: input.phone,
          role: input.role,
        })
        context.log.info('admin updated user', { targetId: input.id, role: input.role })
        await realtime.publish(
          { kind: 'user.changed', ids: [updated.id] },
          { source: context.user.id },
        )
        return updated
      } catch (err) {
        rethrowAsORPC(err, 'update')
      }
    }),

  delete: adminProcedure.input(z.object({ id: z.uuid() })).handler(async ({ input, context }) => {
    try {
      await userService.softDeleteAsAdmin(context.user.id, input.id)
    } catch (err) {
      rethrowAsORPC(err, 'delete')
    }
    await auth.api.revokeUserSessions({
      body: { userId: input.id },
      headers: context.headers,
    })
    context.log.info('admin soft-deleted user', { targetId: input.id })
    await realtime.publish({ kind: 'user.changed', ids: [input.id] }, { source: context.user.id })
  }),

  restore: adminProcedure.input(z.object({ id: z.uuid() })).handler(async ({ input, context }) => {
    try {
      await userService.restoreAsAdmin(input.id)
    } catch (err) {
      rethrowAsORPC(err, 'restore')
    }
    context.log.info('admin restored user', { targetId: input.id })
    await realtime.publish({ kind: 'user.changed', ids: [input.id] }, { source: context.user.id })
  }),
}
