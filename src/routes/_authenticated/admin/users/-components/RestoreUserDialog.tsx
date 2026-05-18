import { useMutation, useQueryClient } from '@tanstack/react-query'
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
  userName?: string
  onOpenChange: (open: boolean) => void
}

const TITLE = 'Återställ användare?'

export function RestoreUserDialog({ open, userId, userName, onOpenChange }: Props) {
  const queryClient = useQueryClient()

  const restoreMutation = useMutation(
    orpc.user.restore.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.user.list.key(),
        })
        toast.success('Användaren återställdes')
        onOpenChange(false)
      },
      onError: (err) => {
        toast.error(err.message || 'Kunde inte återställa användaren')
      },
    }),
  )

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{TITLE}</AlertDialogTitle>
          <AlertDialogDescription>
            {userName
              ? `${userName} kommer kunna logga in igen via magisk länk.`
              : 'Användaren kommer kunna logga in igen via magisk länk.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={restoreMutation.isPending}>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            disabled={restoreMutation.isPending || !userId}
            onClick={(e) => {
              e.preventDefault()
              if (!userId) return
              restoreMutation.mutate({ id: userId })
            }}
          >
            {restoreMutation.isPending && <Spinner data-icon="inline-start" />}
            Återställ
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
