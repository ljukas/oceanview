import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { FileIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import {
  type CurrentUser,
  type DocumentRow,
  type FolderRow,
  seldocKey,
  selfolderKey,
} from '~/components/document/shared/documentHelpers'
import { DocumentTableHeader } from '~/components/document/table/DocumentTableHeader'
import { DocumentTablePagination } from '~/components/document/table/DocumentTablePagination'
import { DocumentTableRow } from '~/components/document/table/DocumentTableRow'
import { columns } from '~/components/document/table/documentColumns'
import { FolderTableRow, FolderUpRow } from '~/components/document/table/FolderTableRow'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty'
import { Table, TableBody, TableCell, TableRow } from '~/components/ui/table'
import { useRowSelection } from '~/hooks/useRowSelection'

type Props = {
  documents: Array<DocumentRow>
  currentUser: CurrentUser
  /** All active folders (the flat tree), for rendering child + up rows. */
  folders: Array<FolderRow>
  /** Resolved folder id from the URL, or null for the virtual root. */
  activeFolderId: string | null
  isAdmin: boolean
  /** The selection Set of composite keys (`seldoc:`/`selfolder:`), owned by DocumentsView. */
  selected: Set<string>
  setSelected: (next: Set<string>) => void
  /** Selected document ids, derived from `selected`. */
  selectedDocIds: Array<string>
  /** Selected folder ids, derived from `selected` (admin-only). */
  selectedFolderIds: Array<string>
  /** True when the user may act on the whole selection (docs editable; folders ⇒ admin). */
  canActOnAll: boolean
  clearSelection: () => void
}

export function DocumentTable({
  documents,
  currentUser,
  folders,
  activeFolderId,
  isAdmin,
  selected,
  setSelected,
  selectedDocIds,
  selectedFolderIds,
  canActOnAll,
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

  // The visible order (folders pinned above the sorted+paginated file rows)
  // drives shift-range selection, so the range spans folders→files uniformly.
  // Folder keys only join the shared selection for admins; non-admins keep a
  // cosmetic single-folder highlight (`cosmeticFolderId`) that never enters the
  // Set, the bar, or dnd.
  const orderedKeys = useMemo(
    () => [
      ...(isAdmin ? childFolders.map((f) => selfolderKey(f.id)) : []),
      ...rows.map((r) => seldocKey(r.original.id)),
    ],
    [isAdmin, childFolders, rows],
  )
  const [cosmeticFolderId, setCosmeticFolderId] = useState<string | null>(null)
  // Selecting docs clears the non-admin cosmetic folder highlight (no-op for
  // admins, whose folders live in the Set); keeps the two mutually exclusive.
  const setDocSelection = useCallback(
    (next: Set<string>) => {
      setCosmeticFolderId(null)
      setSelected(next)
    },
    [setSelected],
  )
  const { onRowClick } = useRowSelection({
    orderedIds: orderedKeys,
    selected,
    setSelected: setDocSelection,
  })
  const selectRow = (key: string) => setDocSelection(new Set([key]))
  const selectionCount = selectedDocIds.length + selectedFolderIds.length
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

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border">
        <Table className="table-fixed">
          <DocumentTableHeader table={table} />
          <TableBody>
            {showUp ? (
              <FolderUpRow parentId={parentId} parent={parent} onClear={clearSelection} />
            ) : null}
            {childFolders.map((folder) => (
              <FolderTableRow
                key={folder.id}
                folder={folder}
                isAdmin={isAdmin}
                isSelected={
                  isAdmin ? selected.has(selfolderKey(folder.id)) : cosmeticFolderId === folder.id
                }
                onSelect={(mods) => {
                  if (isAdmin) onRowClick(selfolderKey(folder.id), mods)
                  else {
                    setSelected(new Set())
                    setCosmeticFolderId(folder.id)
                  }
                }}
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
                  isSelected={selected.has(seldocKey(row.original.id))}
                  selectedDocIds={selectedDocIds}
                  selectedFolderIds={selectedFolderIds}
                  selectionCount={selectionCount}
                  canActOnAll={canActOnAll}
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
        <DocumentTablePagination table={table} total={documents.length} />
      ) : null}
    </div>
  )
}
