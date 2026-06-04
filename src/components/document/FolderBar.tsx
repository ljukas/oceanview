import { useDroppable } from '@dnd-kit/core'
import { Link } from '@tanstack/react-router'
import { FolderIcon } from 'lucide-react'
import { cn } from '~/lib/utils'
import { type FolderRow, folderDropId, folderPathToSplat } from './documentHelpers'
import { FolderActions } from './FolderActions'

type Props = {
  folders: Array<FolderRow>
  activeFolderId: string | null
  isAdmin: boolean
}

/**
 * Direct children of the active folder, shown as clickable, droppable chips
 * above the file table. Clicking a chip navigates into that folder; dragging a
 * document onto it moves the document there. Managing a folder
 * (rename/move/delete) happens from its parent's chip — the breadcrumb is the
 * way back up. Renders nothing when the current folder has no subfolders.
 */
export function FolderBar({ folders, activeFolderId, isAdmin }: Props) {
  const children = folders.filter((f) => f.parentId === activeFolderId)
  if (children.length === 0) return null

  return (
    <section aria-label="Mappar" className="flex flex-col gap-2">
      <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Mappar</h2>
      <ul className="flex flex-wrap gap-2">
        {children.map((folder) => (
          <FolderChip key={folder.id} folder={folder} isAdmin={isAdmin} />
        ))}
      </ul>
    </section>
  )
}

function FolderChip({ folder, isAdmin }: { folder: FolderRow; isAdmin: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: folderDropId(folder.id) })

  return (
    <li
      ref={setNodeRef}
      className={cn(
        'flex items-center overflow-hidden rounded-lg border bg-card',
        isOver && 'bg-accent ring-2 ring-ring',
      )}
    >
      <Link
        to="/documents/$"
        params={{ _splat: folderPathToSplat(folder.path) }}
        className="flex min-w-0 items-center gap-2 border-r py-2 pr-2.5 pl-3 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <FolderIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="max-w-[12rem] truncate font-medium">{folder.name}</span>
      </Link>
      <FolderActions
        folderId={folder.id}
        folderName={folder.name}
        isAdmin={isAdmin}
        triggerClassName="h-full w-9 rounded-none focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      />
    </li>
  )
}
