import { FolderInputIcon, Trash2Icon, XIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { useDialogState } from '~/hooks/useDialogState'
import { DeleteDocumentsDialog } from './DeleteDocumentsDialog'
import { MoveDialog } from './MoveDialog'

type Props = {
  selectedIds: Array<string>
  /** Active folder (the selection's source) — for move/delete cache scoping. */
  folderId: string | null
  /** True when every selected doc is editable by the current user. */
  canEditAll: boolean
  clearSelection: () => void
}

/**
 * Bulk-action bar shown while documents are selected: the keyboard-accessible,
 * discoverable parallel to right-click and drag. Flytta / Ta bort act on the
 * whole selection; Avmarkera clears it. Renders nothing when nothing is selected.
 */
export function DocumentSelectionBar({ selectedIds, folderId, canEditAll, clearSelection }: Props) {
  const dialog = useDialogState<'move' | 'delete'>()
  const count = selectedIds.length
  if (count === 0) return null

  return (
    // Floating pill, fixed to the viewport bottom-centre, so showing/hiding it
    // never shifts the table layout. Slides in on mount.
    <div className="fade-in slide-in-from-bottom-4 fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 animate-in items-center gap-3 rounded-full border bg-card py-2 pr-2 pl-4 shadow-lg duration-150">
      <span aria-live="polite" className="font-medium text-sm">
        {count} valda
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!canEditAll}
          onClick={() => dialog.show('move')}
        >
          <FolderInputIcon data-icon="inline-start" />
          Flytta
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!canEditAll}
          onClick={() => dialog.show('delete')}
          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2Icon data-icon="inline-start" />
          Ta bort
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Avmarkera" onClick={clearSelection}>
          <XIcon />
        </Button>
      </div>

      {dialog.active === 'move' ? (
        <MoveDialog
          open
          onOpenChange={dialog.close}
          target={{ kind: 'documents', ids: selectedIds, folderId, count, onMoved: clearSelection }}
        />
      ) : null}
      {dialog.active === 'delete' ? (
        <DeleteDocumentsDialog
          open
          onOpenChange={dialog.close}
          ids={selectedIds}
          folderId={folderId}
          onDeleted={clearSelection}
        />
      ) : null}
    </div>
  )
}
