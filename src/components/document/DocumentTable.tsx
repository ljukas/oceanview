import { useDraggable } from '@dnd-kit/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type Column,
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type Row,
  useReactTable,
} from '@tanstack/react-table'
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { orpc } from '~/lib/orpc/client'
import { cn } from '~/lib/utils'
import { DocumentHistory } from './DocumentHistory'
import { DocumentThumbnail } from './DocumentThumbnail'
import {
  type CurrentUser,
  type DocumentRow,
  documentDateFormatter,
  documentDisplayName,
  documentDragId,
  formatSize,
} from './documentHelpers'
import { MoveDialog } from './MoveDialog'
import { RenameDocumentDialog } from './RenameDocumentDialog'

type Props = {
  documents: Array<DocumentRow>
  currentUser: CurrentUser
}

const PAGE_SIZES = [20, 50, 100]

// Secondary columns collapse together below `md`; their values reappear as a
// muted line under the filename so nothing is lost on narrow screens. The
// table is `table-fixed` so these explicit widths let the Namn column absorb
// the remaining space (and truncate) instead of overflowing.
const OWNER_CELL = 'hidden w-40 md:table-cell'
const DATE_CELL = 'hidden w-28 md:table-cell'
const SIZE_CELL = 'hidden w-24 md:table-cell'

// Only the sortable data columns live in the table model. The drag handle and
// the actions menu are rendered per row (they need row-level dnd + dialog
// state), so they aren't part of the column defs.
const columns: Array<ColumnDef<DocumentRow>> = [
  {
    id: 'name',
    accessorFn: (d) => documentDisplayName(d),
    header: 'Namn',
    sortingFn: 'text',
  },
  {
    id: 'ownerName',
    accessorFn: (d) => d.ownerName,
    header: 'Ägare',
    sortingFn: 'text',
  },
  {
    id: 'uploadedAt',
    accessorFn: (d) => d.uploadedAt,
    header: 'Uppladdad',
    sortingFn: 'datetime',
  },
  {
    id: 'sizeBytes',
    accessorFn: (d) => d.sizeBytes,
    header: 'Storlek',
    sortingFn: 'basic',
  },
]

export function DocumentTable({ documents, currentUser }: Props) {
  const table = useReactTable({
    data: documents,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 20, pageIndex: 0 },
      sorting: [{ id: 'uploadedAt', desc: true }],
    },
  })

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

  const rows = table.getRowModel().rows
  const { pageIndex, pageSize } = table.getState().pagination
  const total = documents.length
  const from = pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, total)
  const pageCount = table.getPageCount()

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <SortableHead column={table.getColumn('name')} label="Namn" className="w-full" />
              <SortableHead
                column={table.getColumn('ownerName')}
                label="Ägare"
                className={OWNER_CELL}
              />
              <SortableHead
                column={table.getColumn('uploadedAt')}
                label="Uppladdad"
                className={DATE_CELL}
              />
              <SortableHead
                column={table.getColumn('sizeBytes')}
                label="Storlek"
                align="end"
                className={SIZE_CELL}
              />
              <TableHead className="w-10">
                <span className="sr-only">Åtgärder</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <DocumentTableRow key={row.original.id} row={row} currentUser={currentUser} />
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-muted-foreground text-sm tabular-nums">
          {`Visar ${from}–${to} av ${total}`}
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Rader per sida</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger size="sm" className="w-[4.5rem]" aria-label="Rader per sida">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm tabular-nums">
              {`Sida ${pageIndex + 1} / ${pageCount}`}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Föregående sida"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Nästa sida"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SortableHead({
  column,
  label,
  align = 'start',
  className,
}: {
  column: Column<DocumentRow> | undefined
  label: string
  align?: 'start' | 'end'
  className?: string
}) {
  if (!column) return null
  const sorted = column.getIsSorted()
  const Icon = sorted === 'asc' ? ArrowUpIcon : sorted === 'desc' ? ArrowDownIcon : ArrowUpDownIcon
  return (
    <TableHead
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
      className={className}
    >
      <Button
        variant="ghost"
        size="sm"
        className={cn('-ml-2 h-8 text-muted-foreground', align === 'end' && '-mr-2 ml-auto')}
        onClick={() => column.toggleSorting()}
      >
        {label}
        <Icon data-icon="inline-end" className="text-muted-foreground" />
      </Button>
    </TableHead>
  )
}

type OpenDialog = 'rename' | 'move' | 'history' | null

function DocumentTableRow({
  row,
  currentUser,
}: {
  row: Row<DocumentRow>
  currentUser: CurrentUser
}) {
  const doc = row.original
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
    <TableRow
      ref={setNodeRef}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      className={cn(isDragging && 'select-none opacity-50')}
    >
      <TableCell className="pr-0">
        <button
          type="button"
          aria-label="Dra för att flytta"
          className="flex size-7 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon aria-hidden="true" className="size-4" />
        </button>
      </TableCell>

      <TableCell>
        <div className="flex min-w-0 items-center gap-3">
          <DocumentThumbnail
            id={doc.id}
            mime={doc.mime}
            blurhash={doc.blurhash}
            className="size-9 shrink-0"
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium" title={documentDisplayName(doc)}>
              {documentDisplayName(doc)}
            </span>
            <span className="truncate text-muted-foreground text-xs tabular-nums md:hidden">
              {`${doc.ownerName} • ${documentDateFormatter.format(doc.uploadedAt)} • ${formatSize(doc.sizeBytes)}`}
            </span>
          </div>
        </div>
      </TableCell>

      <TableCell className={cn(OWNER_CELL, 'truncate text-muted-foreground')}>
        {doc.ownerName}
      </TableCell>
      <TableCell className={cn(DATE_CELL, 'text-muted-foreground tabular-nums')}>
        {documentDateFormatter.format(doc.uploadedAt)}
      </TableCell>
      <TableCell className={cn(SIZE_CELL, 'text-right text-muted-foreground tabular-nums')}>
        {formatSize(doc.sizeBytes)}
      </TableCell>

      <TableCell className="pl-0 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Dokumentåtgärder">
              <MoreVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <a href={`/api/files/download/${doc.id}`}>
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

        {/* Mounted only while open so the dialogs' queries (MoveDialog's folder
            tree, DocumentHistory's events) don't subscribe behind every row. */}
        {dialog === 'rename' ? (
          <RenameDocumentDialog
            open
            onOpenChange={() => setDialog(null)}
            document={{ id: doc.id, name: doc.name, extension: doc.extension }}
          />
        ) : null}
        {dialog === 'move' ? (
          <MoveDialog
            open
            onOpenChange={() => setDialog(null)}
            target={{ kind: 'document', id: doc.id, name: documentDisplayName(doc) }}
          />
        ) : null}
        {dialog === 'history' ? (
          <DocumentHistory
            open
            onOpenChange={() => setDialog(null)}
            documentId={doc.id}
            documentName={documentDisplayName(doc)}
          />
        ) : null}
      </TableCell>
    </TableRow>
  )
}
