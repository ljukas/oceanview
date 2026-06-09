import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { realtime } from '~/lib/effects'
import { adminProcedure, protectedProcedure } from '~/lib/orpc/context'
import * as shareService from '~/lib/services/share'
import { ShareDomainError } from '~/lib/services/share'
import * as userService from '~/lib/services/user'
import { SHARE_CODES, type ShareCode } from '~/lib/shares/codes'

const shareCodeSchema = z.enum(SHARE_CODES)

function rethrowAsORPC(err: unknown, _action: 'assign' | 'unassign'): never {
  if (!(err instanceof ShareDomainError)) throw err
  switch (err.code) {
    case 'PART_NOT_FOUND':
      throw new ORPCError('NOT_FOUND', { message: 'Andelen hittades inte' })
    case 'USER_NOT_FOUND':
      throw new ORPCError('NOT_FOUND', {
        message: 'Användaren hittades inte eller är borttagen',
      })
    case 'ALREADY_CURRENT_OWNER':
      throw new ORPCError('CONFLICT', {
        message: 'Användaren äger redan andelen',
      })
    case 'FROM_DATE_NOT_AFTER_CURRENT':
      throw new ORPCError('CONFLICT', {
        message: 'Datumet måste vara efter nuvarande tilldelning',
      })
    case 'NOT_ASSIGNED':
      throw new ORPCError('CONFLICT', {
        message: 'Andelen är inte tilldelad',
      })
    case 'DATE_NOT_AFTER_CURRENT':
      throw new ORPCError('CONFLICT', {
        message: 'Datumet måste vara efter nuvarande tilldelning',
      })
    case 'LEAVES_USER_WITH_ONLY_HALVES':
      throw new ORPCError('CONFLICT', {
        message: 'Användaren skulle bara äga halvor — varje ägare måste ha minst en hel andel',
      })
  }
}

export type AdminPartRow = {
  id: string
  shareCode: ShareCode
  partNumber: number
  currentOwner: {
    id: string
    name: string
    image: string | null
    imageBlurhash: string | null
  } | null
}

type HistoryUser = {
  id: string
  name: string
  image: string | null
  imageBlurhash: string | null
}

type HistoryChild = {
  partId: string
  user: HistoryUser | null
}

export type AdminHistoryEvent = {
  eventId: string
  // assignedFrom across an event's children is always the same (the service
  // and form write them together). assignedTo is `null` if any child is still
  // active; otherwise the latest close date among children.
  assignedFrom: Date
  assignedTo: Date | null
  isActive: boolean
  // 'whole' = both children, same user. 'split' = both children, different
  // users. 'partial' = single-half event (mid-stream change to one half).
  kind: 'whole' | 'split' | 'partial'
  shareCode: ShareCode
  children: Array<HistoryChild>
}

export const shareRouter = {
  // Current user's owned share parts. The same assignment set is applied to
  // every visible year on the client — ownership changes mid-season are rare.
  listMine: protectedProcedure.handler(({ context }) =>
    shareService.listCurrentPartsForUser(context.user.id),
  ),

  // Admin grid view: every part with its current owner decorated.
  listAll: adminProcedure.handler(async (): Promise<Array<AdminPartRow>> => {
    const [parts, users] = await Promise.all([
      shareService.listPartsWithCurrentOwner(),
      userService.listAll(),
    ])
    const byId = new Map(users.map((u) => [u.id, u]))
    return parts.map((p) => {
      const owner = p.currentUserId ? byId.get(p.currentUserId) : null
      return {
        id: p.id,
        shareCode: p.shareCode,
        partNumber: p.partNumber,
        currentOwner: owner
          ? {
              id: owner.id,
              name: owner.name,
              image: owner.image,
              imageBlurhash: owner.imageBlurhash,
            }
          : null,
      }
    })
  }),

  // Per-share history Sheet payload. One entry per assignment event, with the
  // wholeness `kind` derived from the event's children at read time so the
  // parent table can never disagree with current ownership.
  listHistory: adminProcedure
    .input(z.object({ shareCode: shareCodeSchema }))
    .handler(async ({ input }): Promise<Array<AdminHistoryEvent>> => {
      const [events, users] = await Promise.all([
        shareService.listShareEvents(input.shareCode),
        userService.listAll(),
      ])
      const byId = new Map(users.map((u) => [u.id, u]))

      return events.map((evt): AdminHistoryEvent => {
        const children: Array<HistoryChild> = evt.children.map((c) => {
          const u = byId.get(c.userId)
          return {
            partId: c.partId,
            user: u
              ? { id: u.id, name: u.name, image: u.image, imageBlurhash: u.imageBlurhash }
              : null,
          }
        })

        const distinctUsers = new Set(evt.children.map((c) => c.userId))
        const kind: AdminHistoryEvent['kind'] =
          evt.children.length === 1 ? 'partial' : distinctUsers.size === 1 ? 'whole' : 'split'

        // All children of an event share the same `assignedFrom` (created in
        // one transaction). `assignedTo` is null while any child is open;
        // otherwise the latest close date among children.
        const assignedFrom = evt.children[0].assignedFrom
        const isActive = evt.children.some((c) => c.assignedTo === null)
        const assignedTo = isActive
          ? null
          : new Date(Math.max(...evt.children.map((c) => c.assignedTo?.getTime() ?? 0)))

        return {
          eventId: evt.eventId,
          assignedFrom,
          assignedTo,
          isActive,
          kind,
          shareCode: input.shareCode,
          children,
        }
      })
    }),

  assign: adminProcedure
    .input(
      z.object({
        shareCode: shareCodeSchema,
        from: z.date(),
        assignment: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('whole'), userId: z.uuid() }),
          z.object({
            kind: z.literal('split'),
            part1UserId: z.uuid(),
            part2UserId: z.uuid(),
          }),
        ]),
      }),
    )
    .handler(async ({ input, context }) => {
      try {
        await shareService.assignShareAsAdmin(input, { actorUserId: context.user.id })
      } catch (err) {
        rethrowAsORPC(err, 'assign')
      }
      context.log.info('admin assigned share', {
        shareCode: input.shareCode,
        kind: input.assignment.kind,
      })
      await realtime.publish(
        { kind: 'share.changed', ids: [input.shareCode] },
        { source: context.user.id },
      )
    }),

  unassign: adminProcedure
    .input(
      z.object({
        shareCode: shareCodeSchema,
        on: z.date(),
        parts: z.enum(['both', '1', '2']),
      }),
    )
    .handler(async ({ input, context }) => {
      try {
        await shareService.unassignShareAsAdmin(input)
      } catch (err) {
        rethrowAsORPC(err, 'unassign')
      }
      context.log.info('admin unassigned share', {
        shareCode: input.shareCode,
        parts: input.parts,
      })
      await realtime.publish(
        { kind: 'share.changed', ids: [input.shareCode] },
        { source: context.user.id },
      )
    }),
}
