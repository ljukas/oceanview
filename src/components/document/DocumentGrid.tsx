import { useDraggable } from '@dnd-kit/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DownloadIcon,
  FileIcon,
  FolderInputIcon,
  GripVerticalIcon,
  HistoryIcon,
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty'
import { orpc } from '~/lib/orpc/client'
import { cn } from '~/lib/utils'
import { DocumentHistory } from './DocumentHistory'
import { DocumentThumbnail } from './DocumentThumbnail'
import {
  type CurrentUser,
  type DocumentRow,
  documentDateFormatter,
  documentDragId,
  formatSize,
} from './documentHelpers'
import { MoveDialog } from './MoveDialog'
import { RenameDocumentDialog } from './RenameDocumentDialog'

type Props = {
  documents: Array<DocumentRow>
  currentUser: CurrentUser
}

export function DocumentGrid({ documents, currentUser }: Props) {
  if (documents.length === 0) {
    return (
      <Empty className="rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileIcon />
          </EmptyMedia>
          <EmptyTitle>Inga dokument här</EmptyTitle>
          <EmptyDescription>
            Ladda upp manualer, försäkringspapper eller annan dokumentation – dra in filer eller
            använd knappen ovan.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {documents.map((doc) => (
        <DocumentTile key={doc.id} doc={doc} currentUser={currentUser} />
      ))}
    </ul>
  )
}

type OpenDialog = 'rename' | 'move' | 'history' | null

function DocumentTile({ doc, currentUser }: { doc: DocumentRow; currentUser: CurrentUser }) {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const canEdit = doc.ownerId === currentUser.id || currentUser.role === 'admin'

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: documentDragId(doc.id),
    data: { documentId: doc.id },
  })

  const deleteMutation = useMutation(
    orpc.document.deleteDocument.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.document.key() })
        toast.success('Dokumentet togs bort (kan återställas av admin)')
      },
      onError: (err) => toast.error(err.message || 'Kunde inte ta bort dokumentet'),
    }),
  )

  return (
    <li
      ref={setNodeRef}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      className={cn(
        'group flex touch-manipulation flex-col gap-2 rounded-lg border bg-card p-2',
        isDragging && 'select-none opacity-50',
      )}
    >
      <div className="relative">
        <DocumentThumbnail
          id={doc.id}
          mime={doc.mime}
          blurhash={doc.blurhash}
          className="aspect-square w-full"
        />
        <button
          type="button"
          aria-label="Dra för att flytta"
          className="absolute top-1 left-1 flex size-6 cursor-grab touch-none items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon aria-hidden="true" className="size-4" />
        </button>
      </div>

      <div className="flex items-start justify-between gap-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 break-words font-medium text-sm" title={doc.name}>
            {doc.name}
          </span>
          <span className="truncate text-muted-foreground text-xs tabular-nums">
            {`${doc.ownerName} • ${documentDateFormatter.format(doc.uploadedAt)} • ${formatSize(doc.sizeBytes)}`}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dokumentåtgärder"
              className="shrink-0"
            >
              <MoreVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <a href={`/api/files/download/${doc.id}`} target="_blank" rel="noopener noreferrer">
                  <DownloadIcon data-icon="inline-start" />
                  Ladda ner
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog('history')}>
                <HistoryIcon data-icon="inline-start" />
                Historik
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {canEdit ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => setDialog('rename')}>
                    <PencilIcon data-icon="inline-start" />
                    Byt namn
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog('move')}>
                    <FolderInputIcon data-icon="inline-start" />
                    Flytta till…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={deleteMutation.isPending}
                    onSelect={() => deleteMutation.mutate({ id: doc.id })}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    Ta bort
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mounted only while open so the dialogs' queries (MoveDialog's folder
          tree, DocumentHistory's events) don't subscribe behind every tile. */}
      {dialog === 'rename' ? (
        <RenameDocumentDialog
          open
          onOpenChange={() => setDialog(null)}
          document={{ id: doc.id, name: doc.name }}
        />
      ) : null}
      {dialog === 'move' ? (
        <MoveDialog
          open
          onOpenChange={() => setDialog(null)}
          target={{ kind: 'document', id: doc.id, name: doc.name }}
        />
      ) : null}
      {dialog === 'history' ? (
        <DocumentHistory
          open
          onOpenChange={() => setDialog(null)}
          documentId={doc.id}
          documentName={doc.name}
        />
      ) : null}
    </li>
  )
}
