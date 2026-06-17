import { z } from 'zod'
import { auth } from '~/lib/auth'
import { realtime } from '~/lib/effects'
import { adminProcedure, protectedProcedure } from '~/lib/orpc/context'
import type { SharePartRow } from '~/lib/services/share'
import * as shareService from '~/lib/services/share'
import * as userService from '~/lib/services/user'
import { UserDomainError, type UserDomainErrorCode } from '~/lib/services/user'
import { m } from '~/paraglide/messages'

function surnameKey(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.at(-1) ?? name
}

const roleSchema = z.enum(['user', 'admin'])

// Error callbacks (not literals) so each parse resolves the active locale —
// the schema itself is module-level and outlives any single request.
const userInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => m.validation_name_required() })
    .max(255, { error: () => m.validation_name_too_long() }),
  email: z
    .email({ error: () => m.validation_email_invalid() })
    .min(1, { error: () => m.validation_email_required() }),
  phone: z
    .string()
    .max(30, { error: () => m.validation_phone_too_long() })
    .refine((v) => v === '' || v.length >= 5, {
      error: () => m.validation_phone_too_short(),
    }),
  role: roleSchema,
})

// Code-only typed errors for the user mutating procedures. Status only; the
// backend stays i18n-free and the client localizes by code (see
// ~/lib/orpc/userErrorMessage). `satisfies` locks the keys to the domain code
// union. CANNOT_ACT_ON_SELF stays a single code — its "delete-self" vs
// "demote-self" phrasing is resolved client-side from the dialog's context.
const userErrors = {
  NOT_FOUND: { status: 404 },
  TARGET_DELETED: { status: 409 },
  CANNOT_ACT_ON_SELF: { status: 403 },
  LAST_ADMIN: { status: 409 },
} satisfies Record<UserDomainErrorCode, { status: number }>

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

  getById: adminProcedure
    .errors(userErrors)
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, errors }) => {
      const target = await userService.findActiveById(input.id)
      if (!target) throw errors.NOT_FOUND()
      return target
    }),

  create: adminProcedure.input(userInputSchema).handler(async ({ input, context }) => {
    const created = await userService.createAsAdmin(input)
    context.log.info('admin created user', { targetId: created.id, role: input.role })
    await realtime.publish({ kind: 'user.changed', ids: [created.id] }, { source: context.user.id })
    return created
  }),

  update: adminProcedure
    .errors(userErrors)
    .input(userInputSchema.extend({ id: z.uuid() }))
    .handler(async ({ input, context, errors }) => {
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
        if (err instanceof UserDomainError) throw errors[err.code]()
        throw err
      }
    }),

  delete: adminProcedure
    .errors(userErrors)
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, context, errors }) => {
      try {
        await userService.softDeleteAsAdmin(context.user.id, input.id)
      } catch (err) {
        if (err instanceof UserDomainError) throw errors[err.code]()
        throw err
      }
      await auth.api.revokeUserSessions({
        body: { userId: input.id },
        headers: context.headers,
      })
      context.log.info('admin soft-deleted user', { targetId: input.id })
      await realtime.publish({ kind: 'user.changed', ids: [input.id] }, { source: context.user.id })
    }),

  restore: adminProcedure
    .errors(userErrors)
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ input, context, errors }) => {
      try {
        await userService.restoreAsAdmin(input.id)
      } catch (err) {
        if (err instanceof UserDomainError) throw errors[err.code]()
        throw err
      }
      context.log.info('admin restored user', { targetId: input.id })
      await realtime.publish({ kind: 'user.changed', ids: [input.id] }, { source: context.user.id })
    }),
}
