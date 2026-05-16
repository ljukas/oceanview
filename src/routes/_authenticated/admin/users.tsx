import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useMatchRoute } from '@tanstack/react-router'
import { PlusIcon, StarIcon } from 'lucide-react'
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
import { orpc } from '~/lib/orpc/client'
import { seo } from '~/utils/seo'
import { DeleteUserDialog } from './users/-components/delete-user-dialog'
import { UserFormDialog } from './users/-components/user-form-dialog'

const usersSearchSchema = z.object({
  dialog: z.enum(['create', 'edit', 'delete']).optional(),
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
    dialog: search.dialog,
    userId: search.userId,
  }),
  loader: async ({ context: { queryClient }, deps }) => {
    await queryClient.ensureQueryData(orpc.user.list.queryOptions())
    if ((deps.dialog === 'edit' || deps.dialog === 'delete') && deps.userId) {
      await queryClient.ensureQueryData(
        orpc.user.getById.queryOptions({ input: { id: deps.userId } }),
      )
    }
  },
  component: AdminUsers,
})

function AdminUsers() {
  const { user: currentUser } = Route.useRouteContext()
  const { data: users } = useSuspenseQuery(orpc.user.list.queryOptions())
  const navigate = Route.useNavigate()
  const matchRoute = useMatchRoute()
  const userId = Route.useSearch({ select: (s) => s.userId })

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

  const editUserId = isEdit ? userId : undefined
  const deleteUserId = isDelete ? userId : undefined

  const closeModal = () => navigate({ to: '.', search: {} })

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-col gap-2">
        <span className="font-semibold text-primary text-xs uppercase tracking-wider">Admin</span>
        <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">Hantera användare</h1>
        <p className="text-muted-foreground text-sm">Skapa, redigera och ta bort användare</p>
      </header>

      <div>
        <Button onClick={() => navigate({ to: '.', search: { dialog: 'create' } })}>
          <PlusIcon />
          Ny användare
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Namn</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefon</TableHead>
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
                  Inga användare än
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isSelf = u.id === currentUser.id
                const isAdmin = u.role === 'admin'
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="text-muted-foreground">{u.phone ?? '—'}</TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <span className="inline-flex items-center gap-1 font-medium text-primary">
                          <StarIcon className="size-3.5 fill-current" />
                          Admin
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Seglare</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            navigate({
                              to: '.',
                              search: { dialog: 'edit', userId: u.id },
                            })
                          }
                        >
                          Redigera
                        </Button>
                        {isSelf ? null : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() =>
                              navigate({
                                to: '.',
                                search: { dialog: 'delete', userId: u.id },
                              })
                            }
                          >
                            Ta bort
                          </Button>
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

      <UserFormDialog
        open={isCreate || (isEdit && editUserId !== undefined)}
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
    </div>
  )
}
