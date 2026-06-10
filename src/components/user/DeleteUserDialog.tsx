import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { Spinner } from '~/components/ui/spinner'
import { orpc } from '~/lib/orpc/client'
import { m } from '~/paraglide/messages'

type Props = {
  open: boolean
  userId?: string
  onOpenChange: (open: boolean) => void
}

export function DeleteUserDialog({ open, userId, onOpenChange }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {userId ? (
          <Suspense fallback={<DeleteUserFallback />}>
            <DeleteUserBody key={userId} userId={userId} onDone={() => onOpenChange(false)} />
          </Suspense>
        ) : (
          <DeleteUserFallback />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteUserFallback() {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{m.user_delete_title()}</AlertDialogTitle>
        <AlertDialogDescription>{m.common_loading()}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
      </AlertDialogFooter>
    </>
  )
}

function DeleteUserBody({ userId, onDone }: { userId: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const { data: user } = useSuspenseQuery(orpc.user.getById.queryOptions({ input: { id: userId } }))

  const deleteMutation = useMutation(
    orpc.user.delete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.user.list.key(),
        })
        toast.success(m.user_deleted())
        onDone()
      },
      onError: (err) => {
        toast.error(err.message || m.user_delete_error())
      },
    }),
  )

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{m.user_delete_title()}</AlertDialogTitle>
        <AlertDialogDescription>
          {m.user_delete_confirm({ name: user.name })}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={deleteMutation.isPending}>
          {m.common_cancel()}
        </AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={deleteMutation.isPending}
          onClick={(e) => {
            e.preventDefault()
            deleteMutation.mutate({ id: userId })
          }}
        >
          {deleteMutation.isPending && <Spinner data-icon="inline-start" />}
          {m.common_delete()}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
