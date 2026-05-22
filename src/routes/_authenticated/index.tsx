import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useMatchRoute } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { z } from 'zod'
import { CreateSeasonDialog } from '~/components/season/CreateSeasonDialog'
import { DeleteSeasonDialog } from '~/components/season/DeleteSeasonDialog'
import { DisponeringslistaTable } from '~/components/season/DisponeringslistaTable'
import { EditSeasonDialog } from '~/components/season/EditSeasonDialog'
import { Button } from '~/components/ui/button'
import { useHandlePasskeySetup } from '~/hooks/usePasskeys'
import { orpc } from '~/lib/orpc/client'

const indexSearchSchema = z.object({
  passkey: z.enum(['setup']).optional(),
  dialog: z.enum(['createSeason', 'editSeason', 'deleteSeason']).optional(),
  seasonYear: z.coerce.number().int().optional(),
})

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: indexSearchSchema,
  loaderDeps: ({ search }) => ({ dialog: search.dialog, seasonYear: search.seasonYear }),
  loader: async ({ context: { queryClient, user }, deps }) => {
    await queryClient.ensureQueryData(orpc.season.listSchedules.queryOptions())
    await queryClient.ensureQueryData(orpc.share.listMine.queryOptions())
    if (user.role !== 'admin') return
    if (deps.dialog === 'createSeason') {
      await queryClient.ensureQueryData(orpc.season.suggestedNext.queryOptions())
    }
    if (deps.dialog === 'editSeason' && deps.seasonYear !== undefined) {
      await queryClient.ensureQueryData(
        orpc.season.getByYear.queryOptions({ input: { year: deps.seasonYear } }),
      )
    }
  },
  component: Calendar,
})

function Calendar() {
  const { user: currentUser } = Route.useRouteContext()
  const passkeyParam = Route.useSearch({ select: (s) => s.passkey })
  const seasonYear = Route.useSearch({ select: (s) => s.seasonYear })
  const navigate = Route.useNavigate()
  const matchRoute = useMatchRoute()

  const { data: schedules } = useSuspenseQuery(orpc.season.listSchedules.queryOptions())
  const { data: ownedParts } = useSuspenseQuery(orpc.share.listMine.queryOptions())

  const ownedPartIds = new Set(ownedParts.map((p) => p.id))

  const isAdmin = currentUser.role === 'admin'
  const isCreateSeason = isAdmin && !!matchRoute({ to: '/', search: { dialog: 'createSeason' } })
  const isEditSeason = isAdmin && !!matchRoute({ to: '/', search: { dialog: 'editSeason' } })
  const isDeleteSeason = isAdmin && !!matchRoute({ to: '/', search: { dialog: 'deleteSeason' } })
  const editYear = isEditSeason ? seasonYear : undefined
  const deleteYear = isDeleteSeason ? seasonYear : undefined

  const handleEdit = (year: number) =>
    void navigate({ to: '.', search: { dialog: 'editSeason', seasonYear: year } })
  const handleDelete = (year: number) =>
    void navigate({ to: '.', search: { dialog: 'deleteSeason', seasonYear: year } })

  useHandlePasskeySetup({
    enabled: passkeyParam === 'setup',
    onHandled: () => void navigate({ to: '/', search: {}, replace: true }),
  })

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">Kalender</h1>
      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={() => navigate({ to: '.', search: { dialog: 'createSeason' } })}>
            <PlusIcon />
            Ny säsong
          </Button>
        </div>
      )}
      <DisponeringslistaTable
        schedules={schedules}
        ownedPartIds={ownedPartIds}
        onEditSeason={isAdmin ? handleEdit : undefined}
        onDeleteSeason={isAdmin ? handleDelete : undefined}
      />
      <CreateSeasonDialog
        open={isCreateSeason}
        onOpenChange={(open) => {
          if (!open) void navigate({ to: '.', search: {} })
        }}
      />
      <EditSeasonDialog
        open={isEditSeason && editYear !== undefined}
        year={editYear}
        onOpenChange={(open) => {
          if (!open) void navigate({ to: '.', search: {} })
        }}
      />
      <DeleteSeasonDialog
        open={isDeleteSeason && deleteYear !== undefined}
        year={deleteYear}
        onOpenChange={(open) => {
          if (!open) void navigate({ to: '.', search: {} })
        }}
      />
    </div>
  )
}
