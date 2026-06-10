import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { orpc } from '~/lib/orpc/client'
import { m } from '~/paraglide/messages'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder: { id: string; name: string }
}

export function DeleteFolderDialog({ open, onOpenChange, folder }: Props) {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation(
    orpc.folder.softDeleteFolder.mutationOptions({
      onSuccess: async (result) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.folder.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.document.listDocuments.key() }),
          // The folder and its documents land in the admin bin — refresh it.
          queryClient.invalidateQueries({ queryKey: orpc.bin.key() }),
        ])
        toast.success(
          m.folder_deleted_toast({
            folders: result.foldersAffected,
            documents: result.documentsAffected,
          }),
        )
        onOpenChange(false)
      },
      onError: (err) => toast.error(err.message || m.folder_delete_error()),
    }),
  )

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {m.document_delete_confirm_title({ name: folder.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>{m.folder_delete_description()}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            {m.common_cancel()}
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate({ id: folder.id })}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.document_action_delete()}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
