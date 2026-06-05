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
          queryClient.invalidateQueries({ queryKey: orpc.document.key() }),
        ])
        toast.success(
          `Mappen togs bort (${result.foldersAffected} mappar, ${result.documentsAffected} dokument)`,
        )
        onOpenChange(false)
      },
      onError: (err) => toast.error(err.message || 'Kunde inte ta bort mappen'),
    }),
  )

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ta bort "{folder.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            Mappen och allt innehåll – undermappar och dokument – flyttas till papperskorgen. En
            administratör kan återställa det därifrån.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            Avbryt
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate({ id: folder.id })}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            Ta bort
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
