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
import { m } from '~/paraglide/messages'

type Props = {
  open: boolean
  userId?: string
  userName?: string
  onOpenChange: (open: boolean) => void
}

export function RestoreUserDialog({ open, userId, userName, onOpenChange }: Props) {
  const queryClient = useQueryClient()

  const restoreMutation = useMutation(
    orpc.user.restore.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.user.list.key(),
        })
        toast.success(m.user_restored())
        onOpenChange(false)
      },
      onError: (err) => {
        toast.error(err.message || m.user_restore_error())
      },
    }),
  )

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.user_restore_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {userName ? m.user_restore_confirm_named({ name: userName }) : m.user_restore_confirm()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={restoreMutation.isPending}>
            {m.common_cancel()}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={restoreMutation.isPending || !userId}
            onClick={(e) => {
              e.preventDefault()
              if (!userId) return
              restoreMutation.mutate({ id: userId })
            }}
          >
            {restoreMutation.isPending && <Spinner data-icon="inline-start" />}
            {m.common_restore()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
