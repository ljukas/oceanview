import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { PasskeySetupPrompt } from '~/components/passkey/PasskeySetupPrompt'
import { CreateSeasonDialog } from '~/components/season/CreateSeasonDialog'
import { DeleteSeasonDialog } from '~/components/season/DeleteSeasonDialog'
import { DisponeringslistaTable } from '~/components/season/DisponeringslistaTable'
import { EditSeasonDialog } from '~/components/season/EditSeasonDialog'
import { Button } from '~/components/ui/button'
import { usePasskeySetupPrompt } from '~/hooks/usePasskeys'
import { useUrlDialog } from '~/hooks/useUrlDialog'
import { orpc } from '~/lib/orpc/client'
import { m } from '~/paraglide/messages'

const indexSearchSchema = z.object({
  passkey: z.enum(['setup']).optional(),
  dialog: z.enum(['createSeason', 'editSeason', 'deleteSeason']).optional(),
  seasonYear: z.coerce.number().int().optional(),
})

type IndexSearch = z.infer<typeof indexSearchSchema>
type IndexDialog = NonNullable<IndexSearch['dialog']>

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
  const dialog = Route.useSearch({ select: (s) => s.dialog })
  const navigate = Route.useNavigate()
  const { isOpen, open, close } = useUrlDialog<IndexDialog, IndexSearch>({
    current: dialog,
    navigate,
    clearKeys: ['seasonYear'],
  })

  const { data: schedules } = useSuspenseQuery(orpc.season.listSchedules.queryOptions())
  const { data: ownedParts } = useSuspenseQuery(orpc.share.listMine.queryOptions())

  const ownedPartIds = new Set(ownedParts.map((p) => p.id))

  const isAdmin = currentUser.role === 'admin'
  const isCreateSeason = isAdmin && isOpen('createSeason')
  const isEditSeason = isAdmin && isOpen('editSeason')
  const isDeleteSeason = isAdmin && isOpen('deleteSeason')
  const editYear = isEditSeason ? seasonYear : undefined
  const deleteYear = isDeleteSeason ? seasonYear : undefined

  const handleEdit = (year: number) => void open('editSeason', { seasonYear: year })
  const handleDelete = (year: number) => void open('deleteSeason', { seasonYear: year })

  // Capture the post-sign-in setup intent once, then strip the ?passkey=setup param so a
  // refresh doesn't reopen the prompt. The captured value keeps the prompt enabled even
  // after the URL is cleaned.
  const [wantsPasskeySetup] = useState(() => passkeyParam === 'setup')
  const passkeyPrompt = usePasskeySetupPrompt({ enabled: wantsPasskeySetup })

  useEffect(() => {
    if (passkeyParam === 'setup') void navigate({ to: '/', search: {}, replace: true })
  }, [passkeyParam, navigate])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">{m.nav_calendar()}</h1>
      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={() => open('createSeason')}>
            <PlusIcon />
            {m.season_create_title()}
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
          if (!open) close()
        }}
      />
      <EditSeasonDialog
        open={isEditSeason && editYear !== undefined}
        year={editYear}
        onOpenChange={(open) => {
          if (!open) close()
        }}
      />
      <DeleteSeasonDialog
        open={isDeleteSeason && deleteYear !== undefined}
        year={deleteYear}
        onOpenChange={(open) => {
          if (!open) close()
        }}
      />
      <PasskeySetupPrompt
        open={passkeyPrompt.open}
        pending={passkeyPrompt.pending}
        onCreate={passkeyPrompt.create}
        onDismiss={passkeyPrompt.dismiss}
      />
    </div>
  )
}
