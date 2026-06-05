import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useNavigate } from '@tanstack/react-router'
import { FolderIcon, FolderUpIcon } from 'lucide-react'
import { useCallback } from 'react'
import { TableCell, TableRow } from '~/components/ui/table'
import { cn } from '~/lib/utils'
import { DATE_CELL, KIND_CELL, OWNER_CELL, SIZE_CELL } from './DocumentTable'
import {
  type FolderRow,
  folderDragId,
  folderDropId,
  folderPathToSplat,
  folderUpDropId,
} from './documentHelpers'
import { FolderActions } from './FolderActions'

// Folder and "up one level" rows pinned above the file rows, behaving like a
// regular OS file browser: a single click selects the row, a double click (or
// Enter) enters the folder. They share the file rows' column grid (empty
// owner/date/size cells keep things aligned) and reuse the same dnd-kit
// droppable ids, so dragging a document onto a row moves it there.

const ROW_SHELL =
  'cursor-default select-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
// Match the file rows' `size-9` thumbnail tile so folder/file names share a
// left edge.
const ICON_TILE = 'flex size-9 shrink-0 items-center justify-center'

/**
 * A child folder of the active folder, as a table row. Single click selects it
 * (macOS-style highlight); double click / Enter navigates in; dragging a
 * document onto it moves the document there. Admins get the rename/move/delete
 * menu via `FolderActions`.
 */
export function FolderTableRow({
  folder,
  isAdmin,
  isSelected,
  onSelect,
}: {
  folder: FolderRow
  isAdmin: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  const navigate = useNavigate()
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: folderDropId(folder.id) })
  // Admins can drag a folder into another folder; the row is both a drop target
  // (receives documents/folders) and a drag source, so merge the two refs.
  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({
    id: folderDragId(folder.id),
    data: { folderId: folder.id },
  })
  const setRowRef = useCallback(
    (node: HTMLTableRowElement | null) => {
      setDropRef(node)
      setDragRef(node)
    },
    [setDropRef, setDragRef],
  )
  const open = () =>
    navigate({ to: '/documents/$', params: { _splat: folderPathToSplat(folder.path) } })

  return (
    <TableRow
      ref={setRowRef}
      {...(isAdmin ? { ...attributes, ...listeners } : {})}
      tabIndex={0}
      aria-selected={isSelected}
      onClick={(e) => {
        if (e.detail > 1) return // part of a double-click
        onSelect()
      }}
      onDoubleClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          open()
        } else if (e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        ROW_SHELL,
        isSelected && 'bg-selected text-selected-foreground hover:bg-selected',
        // Drop-target feedback wins over selection while dragging over it.
        isOver && 'bg-accent text-accent-foreground',
        isDragging && 'opacity-50',
      )}
    >
      <TableCell>
        <div className="flex min-w-0 items-center gap-3">
          <div className={ICON_TILE}>
            <FolderIcon
              aria-hidden="true"
              className={cn(
                'size-5',
                isSelected ? 'text-selected-foreground' : 'text-muted-foreground',
              )}
            />
          </div>
          <span className="min-w-0 truncate font-medium" title={folder.name}>
            {folder.name}
          </span>
        </div>
      </TableCell>
      <TableCell
        className={cn(
          KIND_CELL,
          isSelected ? 'text-selected-foreground/80' : 'text-muted-foreground',
        )}
      >
        Mapp
      </TableCell>
      <TableCell className={DATE_CELL} />
      <TableCell className={OWNER_CELL} />
      <TableCell className={SIZE_CELL} />
      <TableCell className="pl-0 text-right">
        <div className="relative inline-flex">
          <FolderActions folderId={folder.id} folderName={folder.name} isAdmin={isAdmin} />
        </div>
      </TableCell>
    </TableRow>
  )
}

/**
 * The leading "up one level" (`..`) row: double click / Enter steps to the
 * active folder's parent (or the root); a single click clears the selection
 * (it doubles as the "click empty space" target). Accepts documents dropped
 * onto it.
 */
export function FolderUpRow({
  parentId,
  parent,
  onClear,
}: {
  parentId: string | null
  parent: FolderRow | null
  onClear: () => void
}) {
  const navigate = useNavigate()
  const { setNodeRef, isOver } = useDroppable({ id: folderUpDropId(parentId) })
  const destinationName = parent?.name ?? 'Hem'
  const goUp = () =>
    parent
      ? navigate({ to: '/documents/$', params: { _splat: folderPathToSplat(parent.path) } })
      : navigate({ to: '/documents' })

  return (
    <TableRow
      ref={setNodeRef}
      tabIndex={0}
      aria-label={`Upp en nivå (till ${destinationName})`}
      onClick={(e) => {
        if (e.detail > 1) return
        onClear()
      }}
      onDoubleClick={goUp}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          goUp()
        }
      }}
      className={cn(ROW_SHELL, isOver && 'bg-accent text-accent-foreground')}
    >
      <TableCell>
        <div className="flex min-w-0 items-center gap-3">
          <div className={ICON_TILE}>
            <FolderUpIcon aria-hidden="true" className="size-5 text-muted-foreground" />
          </div>
          <span className="font-medium">..</span>
        </div>
      </TableCell>
      <TableCell className={KIND_CELL} />
      <TableCell className={DATE_CELL} />
      <TableCell className={OWNER_CELL} />
      <TableCell className={SIZE_CELL} />
      <TableCell className="pl-0" />
    </TableRow>
  )
}
