import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
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
import { client, orpc } from '~/lib/orpc/client'
import { optimisticRemove } from '~/lib/orpc/optimistic'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Document ids to remove (1 = single-row delete, >1 = bulk). */
  ids: Array<string>
  /** Source folder whose scoped list cache the docs leave (for optimistic drop). */
  folderId: string | null
  /** Shown in the title when deleting exactly one document. */
  name?: string
  /** Called after a successful delete — e.g. to clear the selection. */
  onDeleted?: () => void
}

export function DeleteDocumentsDialog({
  open,
  onOpenChange,
  ids,
  folderId,
  name,
  onDeleted,
}: Props) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)

  const count = ids.length
  const title = count === 1 && name ? `Ta bort "${name}"?` : `Ta bort ${count} filer?`

  // No batch endpoint exists, so fan out single deletes: drop them all from the
  // source list once (optimistic), then fire in parallel and reconcile once.
  const onConfirm = async () => {
    setPending(true)
    const idSet = new Set(ids)
    await optimisticRemove(
      queryClient,
      orpc.document.listDocuments.queryKey({ input: { folderId } }),
      (doc) => idSet.has(doc.id),
    )
    const results = await Promise.allSettled(
      ids.map((id) => client.document.deleteDocument({ id })),
    )
    await queryClient.invalidateQueries({ queryKey: orpc.document.listDocuments.key() })
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed === 0) {
      toast.success(
        count === 1
          ? 'Dokumentet togs bort (kan återställas av admin)'
          : `${count} dokument togs bort (kan återställas av admin)`,
      )
      onDeleted?.()
    } else {
      toast.error(`${failed} av ${count} kunde inte tas bort`)
    }
    setPending(false)
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {count === 1 ? 'Dokumentet flyttas' : 'Dokumenten flyttas'} till papperskorgen. En
            administratör kan återställa {count === 1 ? 'det' : 'dem'} därifrån.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Avbryt
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Ta bort
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
