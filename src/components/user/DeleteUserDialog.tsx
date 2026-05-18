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

type Props = {
  open: boolean
  userId?: string
  onOpenChange: (open: boolean) => void
}

const TITLE = 'Ta bort användare?'

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
        <AlertDialogTitle>{TITLE}</AlertDialogTitle>
        <AlertDialogDescription>Laddar…</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Avbryt</AlertDialogCancel>
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
        toast.success('Användaren togs bort')
        onDone()
      },
      onError: (err) => {
        toast.error(err.message || 'Kunde inte ta bort användaren')
      },
    }),
  )

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{TITLE}</AlertDialogTitle>
        <AlertDialogDescription>
          {`${user.name} kommer inte längre kunna logga in. Användaren finns kvar i historiken.`}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={deleteMutation.isPending}>Avbryt</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={deleteMutation.isPending}
          onClick={(e) => {
            e.preventDefault()
            deleteMutation.mutate({ id: userId })
          }}
        >
          {deleteMutation.isPending && <Spinner data-icon="inline-start" />}
          Ta bort
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
