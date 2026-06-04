import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
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
import { optimisticRemove } from '~/lib/orpc/optimistic'

const ROOT_VALUE = '__root__'

// What is being moved. A document can land anywhere (and carries its source
// `folderId` so the move can drop it from that folder's cache optimistically);
// a folder cannot land in its own subtree (excluded below; the service guards).
type MoveTarget =
  | { kind: 'document'; id: string; name: string; folderId: string | null }
  | { kind: 'folder'; id: string; name: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: MoveTarget
}

export function MoveDialog({ open, onOpenChange, target }: Props) {
  const queryClient = useQueryClient()
  const { data: folders } = useSuspenseQuery(orpc.folder.tree.queryOptions())

  const onSuccess = () => {
    toast.success('Flyttad')
    onOpenChange(false)
  }
  const onError = (err: Error) => toast.error(err.message || 'Kunde inte flytta')
  // Both moves shift folder paths and document lists; reconcile both on settle.
  const onSettled = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.folder.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.document.key() }),
    ])

  const moveDocument = useMutation(
    orpc.document.moveDocument.mutationOptions({
      // A move always targets a different folder, so the doc leaves the source
      // list — drop it from that folder's scoped cache before the round-trip.
      onMutate: ({ id }) =>
        target.kind === 'document'
          ? optimisticRemove(
              queryClient,
              orpc.document.listDocuments.queryKey({ input: { folderId: target.folderId } }),
              (d) => d.id === id,
            )
          : undefined,
      onSuccess,
      onError,
      onSettled,
    }),
  )
  const moveFolder = useMutation(
    orpc.folder.moveFolder.mutationOptions({ onSuccess, onError, onSettled }),
  )

  // For a folder move, hide the folder itself and its descendants (path prefix).
  const self = target.kind === 'folder' ? folders.find((f) => f.id === target.id) : undefined
  const options = [
    { value: ROOT_VALUE, label: 'Hem' },
    ...folders
      .filter((f) => !self || (f.id !== self.id && !f.path.startsWith(self.path)))
      .map((f) => ({ value: f.id, label: f.path })),
  ]

  const form = useAppForm({
    defaultValues: { destination: ROOT_VALUE },
    onSubmit: async ({ value }) => {
      const folderId = value.destination === ROOT_VALUE ? null : value.destination
      if (target.kind === 'document') {
        await moveDocument.mutateAsync({ id: target.id, folderId })
      } else {
        await moveFolder.mutateAsync({ id: target.id, newParentId: folderId })
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Flytta "{target.name}"</DialogTitle>
          <DialogDescription>Välj målmapp.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.AppField name="destination">
            {(field) => <field.SelectField label="Målmapp" options={options} />}
          </form.AppField>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={form.state.isSubmitting}
            >
              Avbryt
            </Button>
            <form.AppForm>
              <form.SubmitButton label="Flytta" />
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
