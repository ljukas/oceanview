import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { AssignmentHistorySheet } from '~/components/share/AssignmentHistorySheet'
import { SharePartCard } from '~/components/share/SharePartCard'
import { UnassignShareDialog } from '~/components/share/UnassignShareDialog'
import { useUrlDialog } from '~/hooks/useUrlDialog'
import { orpc } from '~/lib/orpc/client'
import type { AdminPartRow } from '~/lib/orpc/procedures/share'
import { SHARE_CODES, type ShareCode } from '~/lib/shares/codes'
import { m } from '~/paraglide/messages'
import { seo } from '~/utils/seo'

const shareCodeSchema = z.enum(SHARE_CODES)

// `assign` is no longer a dialog — it's the dedicated route
// `/admin/shares/assign/$shareCode` (ADR-0013). Only unassign + history remain overlays.
const sharesSearchSchema = z.object({
  dialog: z.enum(['unassign', 'history']).optional(),
  shareCode: shareCodeSchema.optional(),
})

type SharesSearch = z.infer<typeof sharesSearchSchema>
type SharesDialog = NonNullable<SharesSearch['dialog']>

export const Route = createFileRoute('/_authenticated/admin/shares/')({
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
  const navigate = Route.useNavigate()
  const dialogShareCode = Route.useSearch({ select: (s) => s.shareCode })
  const dialog = Route.useSearch({ select: (s) => s.dialog })
  const { isOpen, open, close } = useUrlDialog<SharesDialog, SharesSearch>({
    current: dialog,
    navigate,
    clearKeys: ['shareCode'],
  })

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

  const isUnassign = isOpen('unassign')
  const isHistory = isOpen('history')
  const activeSlot = dialogShareCode ? byCode.get(dialogShareCode) : undefined

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
              onAssign={() =>
                navigate({ to: '/admin/shares/assign/$shareCode', params: { shareCode: code } })
              }
              onUnassign={() => open('unassign', { shareCode: code })}
              onHistory={() => open('history', { shareCode: code })}
            />
          )
        })}
      </div>

      <UnassignShareDialog
        open={isUnassign && !!activeSlot}
        onOpenChange={(o) => {
          if (!o) close()
        }}
        shareCode={dialogShareCode}
        part1={activeSlot?.part1}
        part2={activeSlot?.part2}
      />

      <AssignmentHistorySheet
        open={isHistory && !!dialogShareCode}
        onOpenChange={(o) => {
          if (!o) close()
        }}
        shareCode={dialogShareCode}
      />
    </div>
  )
}
