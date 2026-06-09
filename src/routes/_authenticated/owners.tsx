import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useMatchRoute } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group'
import { CreateUserDialog } from '~/components/user/CreateUserDialog'
import { DeleteUserDialog } from '~/components/user/DeleteUserDialog'
import { EditUserDialog } from '~/components/user/EditUserDialog'
import { type OwnerRow, OwnersTable } from '~/components/user/OwnersTable'
import { RestoreUserDialog } from '~/components/user/RestoreUserDialog'
import { orpc } from '~/lib/orpc/client'
import { seo } from '~/utils/seo'

const ownersSearchSchema = z.object({
  filter: z.enum(['active', 'deleted']).optional(),
  dialog: z.enum(['create', 'edit', 'delete', 'restore']).optional(),
  userId: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/owners')({
  head: () => ({
    meta: seo({
      title: 'Delägare | Oceanview',
      description: 'Delägare i Oceanview – kontaktuppgifter och andelar',
    }),
  }),
  validateSearch: ownersSearchSchema,
  loaderDeps: ({ search }) => ({
    filter: search.filter ?? 'active',
    dialog: search.dialog,
    userId: search.userId,
  }),
  loader: async ({ context: { queryClient, user }, deps }) => {
    const isAdmin = user.role === 'admin'
    const showDeleted = isAdmin && deps.filter === 'deleted'
    await Promise.all([
      queryClient.ensureQueryData(orpc.presence.listOnline.queryOptions()),
      showDeleted
        ? queryClient.ensureQueryData(orpc.user.list.queryOptions({ input: { filter: 'deleted' } }))
        : queryClient.ensureQueryData(orpc.user.listContacts.queryOptions()),
      ...(isAdmin && (deps.dialog === 'edit' || deps.dialog === 'delete') && deps.userId
        ? [
            queryClient.ensureQueryData(
              orpc.user.getById.queryOptions({ input: { id: deps.userId } }),
            ),
          ]
        : []),
    ])
  },
  component: Owners,
})

function Owners() {
  const { user: currentUser } = Route.useRouteContext()
  const isAdmin = currentUser.role === 'admin'
  const filter = Route.useSearch({ select: (s) => s.filter ?? 'active' })
  const showDeleted = isAdmin && filter === 'deleted'

  const navigate = Route.useNavigate()
  const matchRoute = useMatchRoute()
  const userId = Route.useSearch({ select: (s) => s.userId })

  const isCreate = isAdmin && !!matchRoute({ to: '/owners', search: { dialog: 'create' } })
  const isEdit = isAdmin && !!matchRoute({ to: '/owners', search: { dialog: 'edit' } })
  const isDelete = isAdmin && !!matchRoute({ to: '/owners', search: { dialog: 'delete' } })
  const isRestore = isAdmin && !!matchRoute({ to: '/owners', search: { dialog: 'restore' } })

  const editUserId = isEdit ? userId : undefined
  const deleteUserId = isDelete ? userId : undefined
  const restoreUserId = isRestore ? userId : undefined

  // Restore only happens from the deleted view, whose list is already cached by
  // the loader — read the name from cache for a friendlier confirmation message.
  const { data: deletedUsers } = useQuery({
    ...orpc.user.list.queryOptions({ input: { filter: 'deleted' } }),
    enabled: showDeleted,
  })
  const restoreUserName = restoreUserId
    ? deletedUsers?.find((u) => u.id === restoreUserId)?.name
    : undefined

  const closeModal = () => navigate({ to: '.', search: showDeleted ? { filter: 'deleted' } : {} })

  const onEdit = (id: string) => navigate({ to: '.', search: { dialog: 'edit', userId: id } })
  const onDelete = (id: string) => navigate({ to: '.', search: { dialog: 'delete', userId: id } })
  const onRestore = (id: string) =>
    navigate({ to: '.', search: { filter: 'deleted', dialog: 'restore', userId: id } })

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">Delägare</h1>
        <p className="text-muted-foreground text-sm">
          Kontaktuppgifter och andelar för delägarna i Oceanview.
        </p>
      </header>

      {isAdmin ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {showDeleted ? (
            <div />
          ) : (
            <Button onClick={() => navigate({ to: '.', search: { dialog: 'create' } })}>
              <PlusIcon />
              Ny delägare
            </Button>
          )}

          <ToggleGroup
            type="single"
            value={filter}
            variant="outline"
            onValueChange={(next) => {
              if (!next || next === filter) return
              navigate({ to: '.', search: { filter: next as 'active' | 'deleted' } })
            }}
            aria-label="Visa delägare"
          >
            <ToggleGroupItem value="active">Aktiva</ToggleGroupItem>
            <ToggleGroupItem value="deleted">Borttagna</ToggleGroupItem>
          </ToggleGroup>
        </div>
      ) : null}

      {showDeleted ? (
        <DeletedOwners
          currentUserId={currentUser.id}
          onRestore={onRestore}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : (
        <ActiveOwners
          currentUserId={currentUser.id}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onDelete={onDelete}
          onRestore={onRestore}
        />
      )}

      {isAdmin ? (
        <>
          <CreateUserDialog
            open={isCreate}
            onOpenChange={(open) => {
              if (!open) closeModal()
            }}
          />
          <EditUserDialog
            open={isEdit && editUserId !== undefined}
            userId={editUserId}
            onOpenChange={(open) => {
              if (!open) closeModal()
            }}
          />
          <DeleteUserDialog
            open={isDelete && deleteUserId !== undefined}
            userId={deleteUserId}
            onOpenChange={(open) => {
              if (!open) closeModal()
            }}
          />
          <RestoreUserDialog
            open={isRestore && restoreUserId !== undefined}
            userId={restoreUserId}
            userName={restoreUserName}
            onOpenChange={(open) => {
              if (!open) closeModal()
            }}
          />
        </>
      ) : null}
    </div>
  )
}

function ActiveOwners({
  currentUserId,
  isAdmin,
  onEdit,
  onDelete,
  onRestore,
}: {
  currentUserId: string
  isAdmin: boolean
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onRestore: (id: string) => void
}) {
  const { data: owners } = useSuspenseQuery(orpc.user.listContacts.queryOptions())
  const { data: onlineIds } = useSuspenseQuery(orpc.presence.listOnline.queryOptions())
  return (
    <OwnersTable
      owners={owners}
      onlineSet={new Set(onlineIds)}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      showDeleted={false}
      onEdit={onEdit}
      onDelete={onDelete}
      onRestore={onRestore}
    />
  )
}

function DeletedOwners({
  currentUserId,
  onEdit,
  onDelete,
  onRestore,
}: {
  currentUserId: string
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onRestore: (id: string) => void
}) {
  const { data: users } = useSuspenseQuery(
    orpc.user.list.queryOptions({ input: { filter: 'deleted' } }),
  )
  const { data: onlineIds } = useSuspenseQuery(orpc.presence.listOnline.queryOptions())
  // Deleted users carry no current share ownership; normalize to the table's row shape.
  const owners: Array<OwnerRow> = users.map((u) => ({ ...u, shares: [] }))
  return (
    <OwnersTable
      owners={owners}
      onlineSet={new Set(onlineIds)}
      currentUserId={currentUserId}
      isAdmin
      showDeleted
      onEdit={onEdit}
      onDelete={onDelete}
      onRestore={onRestore}
    />
  )
}
