import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { useAppForm } from '~/hooks/form'
import { orpc } from '~/lib/orpc/client'
import { optimisticPatch } from '~/lib/orpc/optimistic'

const schema = z.object({ name: z.string().min(1, 'Ange ett namn').max(255) })

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder: { id: string; name: string }
}

export function RenameFolderDialog({ open, onOpenChange, folder }: Props) {
  const queryClient = useQueryClient()

  const renameMutation = useMutation(
    orpc.folder.renameFolder.mutationOptions({
      // Patch the visible name into the folder tree before the round-trip. The
      // rename also rewrites this folder's `path` and its descendants' paths
      // server-side; those path-derived views reconcile on the settle refetch.
      onMutate: ({ name }) =>
        optimisticPatch(
          queryClient,
          orpc.folder.tree.queryKey(),
          (f) => f.id === folder.id,
          (f) => ({ ...f, name }),
        ),
      onSuccess: () => {
        toast.success('Mappen bytte namn')
        onOpenChange(false)
      },
      onError: (err) => toast.error(err.message || 'Kunde inte byta namn på mappen'),
      onSettled: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.folder.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.document.listDocuments.key() }),
        ]),
    }),
  )

  const form = useAppForm({
    defaultValues: { name: folder.name },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await renameMutation.mutateAsync({ id: folder.id, name: value.name })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Byt namn på mapp</DialogTitle>
          <DialogDescription>Undermappars sökvägar uppdateras automatiskt.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.AppField name="name">
            {(field) => <field.TextField label="Namn" autoComplete="off" autoFocus />}
          </form.AppField>

          <DialogFooter className="mt-6">
            <form.AppForm>
              <form.CancelButton onClick={() => onOpenChange(false)}>Avbryt</form.CancelButton>
              <form.SubmitButton label="Spara" />
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
