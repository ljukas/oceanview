import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
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
  /** Document ids to remove. */
  documentIds: Array<string>
  /** Folder ids to remove — each cascades its subfolders + documents (admin-only). */
  folderIds: Array<string>
  /** Source folder whose scoped list cache the docs leave (for optimistic drop). */
  sourceFolderId: string | null
  /** Called after a successful delete — e.g. to clear the selection. */
  onDeleted?: () => void
}

/**
 * Combined soft-delete for a mixed selection of files and folders. Folders
 * cascade their whole subtree server-side; we fan out single deletes (no batch
 * endpoint), optimistically drop the docs + the folders-and-their-descendants
 * from cache, reconcile once, and toast the combined counts once. Folder
 * deletes are admin-only — this dialog is only reached for admin selections.
 */
export function DeleteItemsDialog({
  open,
  onOpenChange,
  documentIds,
  folderIds,
  sourceFolderId,
  onDeleted,
}: Props) {
  const queryClient = useQueryClient()
  const { data: folders } = useSuspenseQuery(orpc.folder.tree.queryOptions())
  const [pending, setPending] = useState(false)

  const count = documentIds.length + folderIds.length

  const onConfirm = async () => {
    setPending(true)
    // Optimistic: drop the docs from the source list, and drop the selected
    // folders plus their descendants (path prefix) from the tree.
    const docSet = new Set(documentIds)
    await optimisticRemove(
      queryClient,
      orpc.document.listDocuments.queryKey({ input: { folderId: sourceFolderId } }),
      (doc) => docSet.has(doc.id),
    )
    const folderSet = new Set(folderIds)
    const removedPaths = folders.filter((f) => folderSet.has(f.id)).map((f) => f.path)
    await optimisticRemove(
      queryClient,
      orpc.folder.tree.queryKey(),
      (f) => folderSet.has(f.id) || removedPaths.some((p) => f.path.startsWith(p)),
    )

    const [docResults, folderResults] = await Promise.all([
      Promise.allSettled(documentIds.map((id) => client.document.deleteDocument({ id }))),
      Promise.allSettled(folderIds.map((id) => client.folder.softDeleteFolder({ id }))),
    ])
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.folder.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.document.listDocuments.key() }),
      // Deleted items land in the admin bin — refresh it.
      queryClient.invalidateQueries({ queryKey: orpc.bin.key() }),
    ])

    const failed =
      docResults.filter((r) => r.status === 'rejected').length +
      folderResults.filter((r) => r.status === 'rejected').length
    if (failed > 0) {
      toast.error(`${failed} av ${count} kunde inte tas bort`)
      setPending(false)
      onOpenChange(false)
      return
    }

    // Combined counts: direct docs + everything the folder cascades swept up.
    let foldersAffected = 0
    let documentsAffected = documentIds.length
    for (const r of folderResults) {
      if (r.status === 'fulfilled') {
        foldersAffected += r.value.foldersAffected
        documentsAffected += r.value.documentsAffected
      }
    }
    toast.success(
      `Togs bort (${foldersAffected} mappar, ${documentsAffected} dokument) – kan återställas av admin`,
    )
    onDeleted?.()
    setPending(false)
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ta bort {count} objekt?</AlertDialogTitle>
          <AlertDialogDescription>
            Markerade filer flyttas till papperskorgen. Markerade mappar tas bort med allt innehåll
            – undermappar och dokument. En administratör kan återställa det därifrån.
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
