import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useMatchRoute } from '@tanstack/react-router'
import {
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SailboatIcon,
  StarIcon,
  Trash2Icon,
} from 'lucide-react'
import { formatPhoneNumberIntl } from 'react-phone-number-input'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip'
import { CreateUserDialog } from '~/components/user/CreateUserDialog'
import { DeleteUserDialog } from '~/components/user/DeleteUserDialog'
import { EditUserDialog } from '~/components/user/EditUserDialog'
import { RestoreUserDialog } from '~/components/user/RestoreUserDialog'
import { UserCard } from '~/components/user/UserCard'
import { orpc } from '~/lib/orpc/client'
import { seo } from '~/utils/seo'

const usersSearchSchema = z.object({
  filter: z.enum(['active', 'deleted']).optional(),
  dialog: z.enum(['create', 'edit', 'delete', 'restore']).optional(),
  userId: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/admin/users')({
  head: () => ({
    meta: seo({
      title: 'Hantera användare | Oceanview',
      description: 'Skapa, redigera och ta bort användare',
    }),
  }),
  validateSearch: usersSearchSchema,
  loaderDeps: ({ search }) => ({
    filter: search.filter ?? 'active',
    dialog: search.dialog,
    userId: search.userId,
  }),
  loader: async ({ context: { queryClient }, deps }) => {
    await queryClient.ensureQueryData(
      orpc.user.list.queryOptions({ input: { filter: deps.filter } }),
    )
    if ((deps.dialog === 'edit' || deps.dialog === 'delete') && deps.userId) {
      await queryClient.ensureQueryData(
        orpc.user.getById.queryOptions({ input: { id: deps.userId } }),
      )
    }
  },
  component: AdminUsers,
})

const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function AdminUsers() {
  const { user: currentUser } = Route.useRouteContext()
  const filter = Route.useSearch({ select: (s) => s.filter ?? 'active' })
  const { data: users } = useSuspenseQuery(orpc.user.list.queryOptions({ input: { filter } }))
  const navigate = Route.useNavigate()
  const matchRoute = useMatchRoute()
  const userId = Route.useSearch({ select: (s) => s.userId })

  const showDeleted = filter === 'deleted'

  const isCreate = !!matchRoute({
    to: '/admin/users',
    search: { dialog: 'create' },
  })
  const isEdit = !!matchRoute({
    to: '/admin/users',
    search: { dialog: 'edit' },
  })
  const isDelete = !!matchRoute({
    to: '/admin/users',
    search: { dialog: 'delete' },
  })
  const isRestore = !!matchRoute({
    to: '/admin/users',
    search: { dialog: 'restore' },
  })

  const editUserId = isEdit ? userId : undefined
  const deleteUserId = isDelete ? userId : undefined
  const restoreUserId = isRestore ? userId : undefined
  const restoreUserName = restoreUserId
    ? users.find((u) => u.id === restoreUserId)?.name
    : undefined

  const closeModal = () => navigate({ to: '.', search: showDeleted ? { filter: 'deleted' } : {} })

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6 p-4 md:p-8">
        <header className="flex flex-col gap-2">
          <span className="font-semibold text-primary text-xs uppercase tracking-wider">Admin</span>
          <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">Hantera användare</h1>
          <p className="text-muted-foreground text-sm">Skapa, redigera och ta bort användare</p>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {showDeleted ? (
            <div />
          ) : (
            <Button onClick={() => navigate({ to: '.', search: { dialog: 'create' } })}>
              <PlusIcon />
              Ny användare
            </Button>
          )}

          <ToggleGroup
            type="single"
            value={filter}
            variant="outline"
            onValueChange={(next) => {
              if (!next || next === filter) return
              navigate({
                to: '.',
                search: { filter: next as 'active' | 'deleted' },
              })
            }}
            aria-label="Visa användare"
          >
            <ToggleGroupItem value="active">Aktiva</ToggleGroupItem>
            <ToggleGroupItem value="deleted">Borttagna</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="hidden rounded-lg border bg-card lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namn</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>{showDeleted ? 'Borttagen' : 'Telefon'}</TableHead>
                <TableHead>Roll</TableHead>
                <TableHead className="w-[1%] text-right">
                  <span className="sr-only">Åtgärder</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                    {showDeleted ? 'Inga borttagna användare' : 'Inga användare än'}
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => {
                  const isSelf = u.id === currentUser.id
                  const isAdmin = u.role === 'admin'
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {showDeleted
                          ? u.deletedAt
                            ? dateFormatter.format(u.deletedAt)
                            : '—'
                          : u.phone
                            ? formatPhoneNumberIntl(u.phone) || u.phone
                            : '—'}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <span className="inline-flex items-center gap-1 font-medium text-primary">
                            <StarIcon className="size-3.5 fill-current" />
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <SailboatIcon className="size-3.5" />
                            Seglare
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {showDeleted ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  aria-label="Återställ"
                                  onClick={() =>
                                    navigate({
                                      to: '.',
                                      search: {
                                        filter: 'deleted',
                                        dialog: 'restore',
                                        userId: u.id,
                                      },
                                    })
                                  }
                                >
                                  <RotateCcwIcon />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Återställ</TooltipContent>
                            </Tooltip>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label="Redigera"
                                onClick={() =>
                                  navigate({
                                    to: '.',
                                    search: { dialog: 'edit', userId: u.id },
                                  })
                                }
                              >
                                <PencilIcon />
                              </Button>
                              {isSelf ? null : (
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  aria-label="Ta bort"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() =>
                                    navigate({
                                      to: '.',
                                      search: { dialog: 'delete', userId: u.id },
                                    })
                                  }
                                >
                                  <Trash2Icon />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 lg:hidden">
          {users.length === 0 ? (
            <div className="rounded-lg border bg-card py-8 text-center text-muted-foreground text-sm">
              {showDeleted ? 'Inga borttagna användare' : 'Inga användare än'}
            </div>
          ) : (
            users.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                isSelf={u.id === currentUser.id}
                showDeleted={showDeleted}
                onEdit={() => navigate({ to: '.', search: { dialog: 'edit', userId: u.id } })}
                onDelete={() => navigate({ to: '.', search: { dialog: 'delete', userId: u.id } })}
                onRestore={() =>
                  navigate({
                    to: '.',
                    search: { filter: 'deleted', dialog: 'restore', userId: u.id },
                  })
                }
              />
            ))
          )}
        </div>

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
      </div>
    </TooltipProvider>
  )
}
