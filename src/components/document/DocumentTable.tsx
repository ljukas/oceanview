import { useDraggable } from '@dnd-kit/core'
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
  FileIcon,
  MoreVerticalIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '~/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '~/components/ui/context-menu'
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
import { useDialogState } from '~/hooks/useDialogState'
import { useRowSelection } from '~/hooks/useRowSelection'
import { cn } from '~/lib/utils'
import { DeleteDocumentsDialog } from './DeleteDocumentsDialog'
import { DocumentHistory } from './DocumentHistory'
import { DocumentThumbnail } from './DocumentThumbnail'
import { buildDocActions, DocumentMenuItems, type MenuComponents } from './documentActions'
import {
  type CurrentUser,
  type DocumentRow,
  documentDateFormatter,
  documentDisplayName,
  documentDragId,
  type FolderRow,
  fileKindLabel,
  formatSize,
} from './documentHelpers'
import { FolderTableRow, FolderUpRow } from './FolderTableRow'
import { MoveDialog } from './MoveDialog'
import { RenameDocumentDialog } from './RenameDocumentDialog'

type Props = {
  documents: Array<DocumentRow>
  currentUser: CurrentUser
  /** All active folders (the flat tree), for rendering child + up rows. */
  folders: Array<FolderRow>
  /** Resolved folder id from the URL, or null for the virtual root. */
  activeFolderId: string | null
  isAdmin: boolean
  /** Selected document ids (owned by DocumentsView). */
  selected: Set<string>
  setSelected: (next: Set<string>) => void
  /** The single selected folder id, or null (mutually exclusive with docs). */
  selectedFolderId: string | null
  selectFolder: (id: string) => void
  /** True when every selected doc is editable by the current user (admin/owner). */
  canEditAll: boolean
  clearSelection: () => void
}

const PAGE_SIZES = [20, 50, 100]

// Secondary columns reveal in two tiers as the viewport widens: Storlek +
// Uppladdad at `md`, Typ + Ägare at `lg`. Whatever isn't yet a column reappears
// as a muted sub-line under the filename, so nothing is lost on narrow screens.
// The table is `table-fixed` so these explicit widths let the Namn column
// absorb the remaining space (and truncate) instead of overflowing. Exported so
// the folder/up rows share the same column grid.
export const KIND_CELL = 'hidden w-40 lg:table-cell'
export const OWNER_CELL = 'hidden w-40 lg:table-cell'
export const DATE_CELL = 'hidden w-28 md:table-cell'
export const SIZE_CELL = 'hidden w-24 md:table-cell'

// The same action list renders into the `⋮` dropdown and the right-click
// context menu by passing the matching radix primitive set.
const dropdownComponents: MenuComponents = {
  Item: DropdownMenuItem,
  Group: DropdownMenuGroup,
  Separator: DropdownMenuSeparator,
}
const contextComponents: MenuComponents = {
  Item: ContextMenuItem,
  Group: ContextMenuGroup,
  Separator: ContextMenuSeparator,
}

// Only the sortable data columns live in the table model. The actions menu is
// rendered per row (it needs row-level dialog state), so it isn't a column def.
const columns: Array<ColumnDef<DocumentRow>> = [
  {
    id: 'name',
    accessorFn: (d) => documentDisplayName(d),
    header: 'Namn',
    sortingFn: 'text',
  },
  {
    id: 'kind',
    accessorFn: (d) => fileKindLabel(d),
    header: 'Typ',
    sortingFn: 'text',
  },
  {
    id: 'uploadedAt',
    accessorFn: (d) => d.uploadedAt,
    header: 'Uppladdad',
    sortingFn: 'datetime',
  },
  {
    id: 'ownerName',
    accessorFn: (d) => d.ownerName,
    header: 'Ägare',
    sortingFn: 'text',
  },
  {
    id: 'sizeBytes',
    accessorFn: (d) => d.sizeBytes,
    header: 'Storlek',
    sortingFn: 'basic',
  },
]

export function DocumentTable({
  documents,
  currentUser,
  folders,
  activeFolderId,
  isAdmin,
  selected,
  setSelected,
  selectedFolderId,
  selectFolder,
  canEditAll,
  clearSelection,
}: Props) {
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

  const rows = table.getRowModel().rows
  // The visible order (post sort + pagination) drives shift-range selection.
  const orderedIds = useMemo(() => rows.map((r) => r.original.id), [rows])
  const { onRowClick } = useRowSelection({ orderedIds, selected, setSelected })
  const selectedIds = useMemo(() => [...selected], [selected])
  const selectRow = (id: string) => setSelected(new Set([id]))

  // Folders are pinned above the (sorted, paginated) file rows like a regular
  // OS file browser — they live outside the table model. Sorted by name (sv
  // locale); toggling the Namn column flips their direction too, so the whole
  // list reads as one A→Z / Z→A. Other column sorts leave folders A→Z. An "up
  // one level" row leads when inside a folder.
  const nameSort = table.getColumn('name')?.getIsSorted()
  const childFolders = folders
    .filter((f) => f.parentId === activeFolderId)
    .toSorted((a, b) => a.name.localeCompare(b.name, 'sv') * (nameSort === 'desc' ? -1 : 1))
  const showUp = activeFolderId !== null
  const activeFolder = activeFolderId ? folders.find((f) => f.id === activeFolderId) : null
  const parentId = activeFolder?.parentId ?? null
  const parent = parentId ? (folders.find((f) => f.id === parentId) ?? null) : null

  const hasAnyRow = showUp || childFolders.length > 0 || documents.length > 0

  // A truly empty root (no folders, no files): the full empty-state card. Inside
  // a folder we always render the table so the "up one level" row stays reachable.
  if (!hasAnyRow) {
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
              <SortableHead column={table.getColumn('name')} label="Namn" className="w-full" />
              <SortableHead column={table.getColumn('kind')} label="Typ" className={KIND_CELL} />
              <SortableHead
                column={table.getColumn('uploadedAt')}
                label="Uppladdad"
                className={DATE_CELL}
              />
              <SortableHead
                column={table.getColumn('ownerName')}
                label="Ägare"
                className={OWNER_CELL}
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
            {showUp ? (
              <FolderUpRow parentId={parentId} parent={parent} onClear={clearSelection} />
            ) : null}
            {childFolders.map((folder) => (
              <FolderTableRow
                key={folder.id}
                folder={folder}
                isAdmin={isAdmin}
                isSelected={selectedFolderId === folder.id}
                onSelect={() => selectFolder(folder.id)}
              />
            ))}
            {documents.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                  {showUp ? 'Inga dokument i den här mappen' : 'Inga dokument här'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <DocumentTableRow
                  key={row.original.id}
                  row={row}
                  currentUser={currentUser}
                  isSelected={selected.has(row.original.id)}
                  selectedIds={selectedIds}
                  canEditAll={canEditAll}
                  onRowClick={onRowClick}
                  selectRow={selectRow}
                  clearSelection={clearSelection}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {documents.length > 0 ? (
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
      ) : null}
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

// Interactive controls inside the row (thumbnail link, ⋮ trigger) must not
// toggle row selection or start a drag — swallow pointer/click before they
// reach the row's handlers.
const swallow = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
}

function DocumentTableRow({
  row,
  currentUser,
  isSelected,
  selectedIds,
  canEditAll,
  onRowClick,
  selectRow,
  clearSelection,
}: {
  row: Row<DocumentRow>
  currentUser: CurrentUser
  isSelected: boolean
  selectedIds: Array<string>
  canEditAll: boolean
  onRowClick: (
    id: string,
    mods: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
  ) => void
  selectRow: (id: string) => void
  clearSelection: () => void
}) {
  const doc = row.original
  const dialog = useDialogState<'rename' | 'move' | 'history' | 'delete'>()
  const canEdit = doc.ownerId === currentUser.id || currentUser.role === 'admin'
  const name = documentDisplayName(doc)
  const kind = fileKindLabel(doc)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: documentDragId(doc.id),
    data: { documentId: doc.id },
  })

  const openFile = () => window.open(`/api/files/view/${doc.id}`, '_blank', 'noopener,noreferrer')

  // Whether the menu/actions act on the whole selection (this row is part of a
  // multi-selection) or just this row.
  const isMulti = isSelected && selectedIds.length > 1
  const actingIds = isMulti ? selectedIds : [doc.id]
  const actingCanEdit = isMulti ? canEditAll : canEdit

  // The `⋮` dropdown always acts on this one row; the right-click menu acts on
  // the whole selection when this row is part of it.
  const dropdownGroups = buildDocActions({
    isMulti: false,
    canEdit,
    downloadHref: `/api/files/download/${doc.id}`,
    onHistory: () => dialog.show('history'),
    onRename: () => dialog.show('rename'),
    onMove: () => dialog.show('move'),
    onDelete: () => dialog.show('delete'),
  })
  const contextGroups = buildDocActions({
    isMulti,
    canEdit: actingCanEdit,
    downloadHref: isMulti ? undefined : `/api/files/download/${doc.id}`,
    onHistory: isMulti ? undefined : () => dialog.show('history'),
    onRename: isMulti ? undefined : () => dialog.show('rename'),
    onMove: () => dialog.show('move'),
    onDelete: () => dialog.show('delete'),
  })

  return (
    <>
      <ContextMenu
        onOpenChange={(open) => {
          // Right-clicking an unselected row selects just it (OS behavior); a
          // selected row keeps the multi-selection so the menu acts on all.
          if (open && !isSelected) selectRow(doc.id)
        }}
      >
        <ContextMenuTrigger asChild>
          <TableRow
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            tabIndex={0}
            aria-selected={isSelected}
            onClick={(e) => {
              if (e.detail > 1) return // part of a double-click
              onRowClick(doc.id, e)
            }}
            onDoubleClick={openFile}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                openFile()
              } else if (e.key === ' ') {
                e.preventDefault()
                onRowClick(doc.id, e)
              } else if (e.key === 'Escape') {
                clearSelection()
              }
            }}
            className={cn(
              'cursor-default select-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              // macOS-style solid selection: the whole row goes accent-blue with
              // light text. Overrides the row's default hover so it stays solid.
              isSelected && 'bg-selected text-selected-foreground hover:bg-selected',
              isDragging && 'opacity-50',
            )}
          >
            <TableCell>
              <div className="flex min-w-0 items-center gap-3">
                <a
                  href={`/api/files/view/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Öppna ${name}`}
                  {...swallow}
                  className="shrink-0 rounded-md outline-none ring-1 ring-transparent transition-all duration-200 hover:shadow-md hover:ring-ring/50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <DocumentThumbnail
                    id={doc.id}
                    mime={doc.mime}
                    extension={doc.extension}
                    blurhash={doc.blurhash}
                    thumbnailPathname={doc.thumbnailPathname}
                    className="size-9"
                  />
                </a>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium" title={name}>
                    {name}
                  </span>
                  {/* Typ + Ägare fold in here until they become columns at `lg`. */}
                  <span
                    className={cn(
                      'truncate text-xs lg:hidden',
                      isSelected ? 'text-selected-foreground/80' : 'text-muted-foreground',
                    )}
                  >
                    {`${kind} • ${doc.ownerName}`}
                  </span>
                  {/* Uppladdad + Storlek fold in here until they become columns at `md`. */}
                  <span
                    className={cn(
                      'truncate text-xs tabular-nums md:hidden',
                      isSelected ? 'text-selected-foreground/80' : 'text-muted-foreground',
                    )}
                  >
                    {`${documentDateFormatter.format(doc.uploadedAt)} • ${formatSize(doc.sizeBytes)}`}
                  </span>
                </div>
              </div>
            </TableCell>

            <TableCell
              className={cn(
                KIND_CELL,
                'truncate',
                isSelected ? 'text-selected-foreground/80' : 'text-muted-foreground',
              )}
              title={kind}
            >
              {kind}
            </TableCell>
            <TableCell
              className={cn(
                DATE_CELL,
                'tabular-nums',
                isSelected ? 'text-selected-foreground/80' : 'text-muted-foreground',
              )}
            >
              {documentDateFormatter.format(doc.uploadedAt)}
            </TableCell>
            <TableCell
              className={cn(
                OWNER_CELL,
                'truncate',
                isSelected ? 'text-selected-foreground/80' : 'text-muted-foreground',
              )}
            >
              {doc.ownerName}
            </TableCell>
            <TableCell
              className={cn(
                SIZE_CELL,
                'text-right tabular-nums',
                isSelected ? 'text-selected-foreground/80' : 'text-muted-foreground',
              )}
            >
              {formatSize(doc.sizeBytes)}
            </TableCell>

            <TableCell className="pl-0 text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Dokumentåtgärder" {...swallow}>
                    <MoreVerticalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DocumentMenuItems groups={dropdownGroups} components={dropdownComponents} />
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <DocumentMenuItems groups={contextGroups} components={contextComponents} />
        </ContextMenuContent>
      </ContextMenu>

      {/* Mounted only while open so the dialogs' queries (MoveDialog's folder
          tree, DocumentHistory's events) don't subscribe behind every row. */}
      {dialog.active === 'rename' ? (
        <RenameDocumentDialog
          open
          onOpenChange={dialog.close}
          document={{
            id: doc.id,
            name: doc.name,
            extension: doc.extension,
            folderId: doc.folderId,
          }}
        />
      ) : null}
      {dialog.active === 'move' ? (
        isMulti ? (
          <MoveDialog
            open
            onOpenChange={dialog.close}
            target={{
              kind: 'documents',
              ids: actingIds,
              folderId: doc.folderId,
              count: actingIds.length,
              onMoved: clearSelection,
            }}
          />
        ) : (
          <MoveDialog
            open
            onOpenChange={dialog.close}
            target={{ kind: 'document', id: doc.id, name, folderId: doc.folderId }}
          />
        )
      ) : null}
      {dialog.active === 'history' ? (
        <DocumentHistory open onOpenChange={dialog.close} documentId={doc.id} documentName={name} />
      ) : null}
      {dialog.active === 'delete' ? (
        <DeleteDocumentsDialog
          open
          onOpenChange={dialog.close}
          ids={actingIds}
          folderId={doc.folderId}
          name={isMulti ? undefined : name}
          onDeleted={isMulti ? clearSelection : undefined}
        />
      ) : null}
    </>
  )
}
