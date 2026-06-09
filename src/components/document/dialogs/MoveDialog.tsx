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
import { client, orpc } from '~/lib/orpc/client'
import { optimisticPatch, optimisticRemove } from '~/lib/orpc/optimistic'

const ROOT_VALUE = '__root__'

// What is being moved. A document can land anywhere (and carries its source
// `folderId` so the move can drop it from that folder's cache optimistically);
// `documents` is the bulk variant (a multi-selection, all in the same source
// folder); `items` is the mixed variant (docs + folders together); a folder
// cannot land in its own subtree (excluded below; the service guards).
type MoveTarget =
  | { kind: 'document'; id: string; name: string; folderId: string | null }
  | {
      kind: 'documents'
      ids: Array<string>
      folderId: string | null
      count: number
      onMoved?: () => void
    }
  | {
      kind: 'items'
      documentIds: Array<string>
      folderIds: Array<string>
      sourceFolderId: string | null
      count: number
      onMoved?: () => void
    }
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
      queryClient.invalidateQueries({ queryKey: orpc.document.listDocuments.key() }),
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
  // For a mixed `items` move, hide every selected folder and their descendants —
  // you can't move a folder into itself or into another folder you're moving.
  const self = target.kind === 'folder' ? folders.find((f) => f.id === target.id) : undefined
  const movingFolderIds = target.kind === 'items' ? target.folderIds : []
  const movingFolderPaths =
    target.kind === 'items'
      ? folders.filter((f) => movingFolderIds.includes(f.id)).map((f) => f.path)
      : []
  const options = [
    { value: ROOT_VALUE, label: 'Hem' },
    ...folders
      .filter((f) => {
        if (self) return f.id !== self.id && !f.path.startsWith(self.path)
        if (target.kind === 'items')
          return (
            !movingFolderIds.includes(f.id) && !movingFolderPaths.some((p) => f.path.startsWith(p))
          )
        return true
      })
      .map((f) => ({ value: f.id, label: f.path })),
  ]

  const form = useAppForm({
    defaultValues: { destination: ROOT_VALUE },
    onSubmit: async ({ value }) => {
      const folderId = value.destination === ROOT_VALUE ? null : value.destination
      if (target.kind === 'document') {
        await moveDocument.mutateAsync({ id: target.id, folderId })
      } else if (target.kind === 'documents') {
        // No batch endpoint: drop all from the source list once, fan out single
        // moves, reconcile once, and toast once (the per-id mutation would toast
        // and invalidate N times).
        const idSet = new Set(target.ids)
        await optimisticRemove(
          queryClient,
          orpc.document.listDocuments.queryKey({ input: { folderId: target.folderId } }),
          (d) => idSet.has(d.id),
        )
        const results = await Promise.allSettled(
          target.ids.map((id) => client.document.moveDocument({ id, folderId })),
        )
        await onSettled()
        const failed = results.filter((r) => r.status === 'rejected').length
        if (failed > 0) {
          toast.error(`${failed} av ${target.count} kunde inte flyttas`)
          return
        }
        toast.success(`${target.count} dokument flyttades`)
        target.onMoved?.()
        onOpenChange(false)
      } else if (target.kind === 'items') {
        // Mixed move: optimistically drop docs from the source list and
        // re-parent folders in the tree, then fan out single moves (no batch
        // endpoint), reconcile once, and toast once.
        const docSet = new Set(target.documentIds)
        const folderSet = new Set(target.folderIds)
        await optimisticRemove(
          queryClient,
          orpc.document.listDocuments.queryKey({ input: { folderId: target.sourceFolderId } }),
          (d) => docSet.has(d.id),
        )
        await optimisticPatch(
          queryClient,
          orpc.folder.tree.queryKey(),
          (f) => folderSet.has(f.id),
          (f) => ({ ...f, parentId: folderId }),
        )
        const results = await Promise.allSettled([
          ...target.documentIds.map((id) => client.document.moveDocument({ id, folderId })),
          ...target.folderIds.map((id) => client.folder.moveFolder({ id, newParentId: folderId })),
        ])
        await onSettled()
        const failed = results.filter((r) => r.status === 'rejected').length
        if (failed > 0) {
          toast.error(`${failed} av ${target.count} kunde inte flyttas`)
          return
        }
        toast.success(`${target.count} objekt flyttades`)
        target.onMoved?.()
        onOpenChange(false)
      } else {
        await moveFolder.mutateAsync({ id: target.id, newParentId: folderId })
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target.kind === 'documents'
              ? `Flytta ${target.count} dokument`
              : target.kind === 'items'
                ? `Flytta ${target.count} objekt`
                : `Flytta "${target.name}"`}
          </DialogTitle>
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
