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
import { useDeletePasskey } from '~/hooks/usePasskeys'

type Props = {
  passkeyId: string | null
  onClose: () => void
}

export function DeletePasskeyDialog({ passkeyId, onClose }: Props) {
  const deletePasskey = useDeletePasskey()

  return (
    <AlertDialog
      open={passkeyId !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ta bort passkey?</AlertDialogTitle>
          <AlertDialogDescription>
            Du kommer inte längre kunna logga in med den här passkey-en på den enhet där den
            skapades. Du kan alltid lägga till en ny.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletePasskey.isPending}>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deletePasskey.isPending || !passkeyId}
            onClick={(e) => {
              e.preventDefault()
              if (!passkeyId) return
              deletePasskey.mutate(passkeyId, { onSuccess: onClose })
            }}
          >
            {deletePasskey.isPending && <Spinner data-icon="inline-start" />}
            Ta bort
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
