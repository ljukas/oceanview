import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useMatchRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { AssignmentHistorySheet } from '~/components/share/AssignmentHistorySheet'
import { AssignShareDialog } from '~/components/share/AssignShareDialog'
import { SharePartCard } from '~/components/share/SharePartCard'
import { UnassignShareDialog } from '~/components/share/UnassignShareDialog'
import { orpc } from '~/lib/orpc/client'
import type { AdminPartRow } from '~/lib/orpc/procedures/share'
import { SHARE_CODES, type ShareCode } from '~/lib/shares/codes'
import { m } from '~/paraglide/messages'
import { seo } from '~/utils/seo'

const shareCodeSchema = z.enum(SHARE_CODES)

const sharesSearchSchema = z.object({
  dialog: z.enum(['assign', 'unassign', 'history']).optional(),
  shareCode: shareCodeSchema.optional(),
})

export const Route = createFileRoute('/_authenticated/admin/shares')({
  head: () => ({
    meta: seo({
      title: m.meta_shares_title(),
      description: m.meta_shares_description(),
    }),
  }),
  validateSearch: sharesSearchSchema,
  loaderDeps: ({ search }) => ({
    dialog: search.dialog,
    shareCode: search.shareCode,
  }),
  loader: async ({ context: { queryClient }, deps }) => {
    await Promise.all([
      queryClient.ensureQueryData(orpc.share.listAll.queryOptions()),
      queryClient.ensureQueryData(orpc.user.list.queryOptions({ input: { filter: 'active' } })),
      ...(deps.dialog === 'history' && deps.shareCode
        ? [
            queryClient.ensureQueryData(
              orpc.share.listHistory.queryOptions({ input: { shareCode: deps.shareCode } }),
            ),
          ]
        : []),
    ])
  },
  component: AdminShares,
})

function AdminShares() {
  const { data: parts } = useSuspenseQuery(orpc.share.listAll.queryOptions())
  const { data: users } = useSuspenseQuery(
    orpc.user.list.queryOptions({ input: { filter: 'active' } }),
  )
  const navigate = Route.useNavigate()
  const matchRoute = useMatchRoute()
  const dialogShareCode = Route.useSearch({ select: (s) => s.shareCode })

  // Group parts by shareCode so each card receives its pair.
  const byCode = useMemo(() => {
    const map = new Map<ShareCode, { part1: AdminPartRow; part2: AdminPartRow }>()
    for (const p of parts) {
      const code = p.shareCode
      const slot = map.get(code) ?? ({} as { part1: AdminPartRow; part2: AdminPartRow })
      if (p.partNumber === 1) slot.part1 = p
      else if (p.partNumber === 2) slot.part2 = p
      map.set(code, slot)
    }
    return map
  }, [parts])

  const userOptions = useMemo(
    () => users.map((u) => ({ id: u.id, name: u.name, image: u.image })),
    [users],
  )

  const isAssign = !!matchRoute({ to: '/admin/shares', search: { dialog: 'assign' } })
  const isUnassign = !!matchRoute({ to: '/admin/shares', search: { dialog: 'unassign' } })
  const isHistory = !!matchRoute({ to: '/admin/shares', search: { dialog: 'history' } })

  const activeSlot = dialogShareCode ? byCode.get(dialogShareCode) : undefined

  const close = () => navigate({ to: '.', search: {} })

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-col gap-2">
        <span className="font-semibold text-primary text-xs uppercase tracking-wider">
          {m.user_role_admin()}
        </span>
        <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
          {m.share_manage_title()}
        </h1>
        <p className="text-muted-foreground text-sm">{m.share_manage_description()}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {SHARE_CODES.map((code) => {
          const slot = byCode.get(code)
          if (!slot) return null
          return (
            <SharePartCard
              key={code}
              shareCode={code}
              part1={slot.part1}
              part2={slot.part2}
              onAssign={() => navigate({ to: '.', search: { dialog: 'assign', shareCode: code } })}
              onUnassign={() =>
                navigate({ to: '.', search: { dialog: 'unassign', shareCode: code } })
              }
              onHistory={() =>
                navigate({ to: '.', search: { dialog: 'history', shareCode: code } })
              }
            />
          )
        })}
      </div>

      <AssignShareDialog
        open={isAssign && !!activeSlot}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        shareCode={dialogShareCode}
        part1={activeSlot?.part1}
        part2={activeSlot?.part2}
        users={userOptions}
      />

      <UnassignShareDialog
        open={isUnassign && !!activeSlot}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        shareCode={dialogShareCode}
        part1={activeSlot?.part1}
        part2={activeSlot?.part2}
      />

      <AssignmentHistorySheet
        open={isHistory && !!dialogShareCode}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        shareCode={dialogShareCode}
      />
    </div>
  )
}
