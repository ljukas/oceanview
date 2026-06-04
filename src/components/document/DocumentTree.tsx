import { useDroppable } from '@dnd-kit/core'
import { Link } from '@tanstack/react-router'
import { ChevronRightIcon, FolderIcon, FolderOpenIcon, LibraryIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '~/lib/utils'
import {
  buildFolderTree,
  type FolderNode,
  type FolderRow,
  folderDropId,
  folderTrail,
  ROOT_DROP_ID,
} from './documentHelpers'
import { FolderActions } from './FolderActions'

type Props = {
  folders: Array<FolderRow>
  activeFolderId: string | null
  isAdmin: boolean
}

export function DocumentTree({ folders, activeFolderId, isAdmin }: Props) {
  const roots = buildFolderTree(folders)
  // Expand the ancestors of the active folder by default.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(folderTrail(folders, activeFolderId).map((f) => f.id)),
  )

  // Re-expand the active folder's ancestors when navigation changes it from
  // outside the tree (search hit, breadcrumb). Lazy init only runs on mount, so
  // without this the tree stays collapsed around a deep-linked folder.
  useEffect(() => {
    const trail = folderTrail(folders, activeFolderId)
    if (trail.length === 0) return
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const f of trail) next.add(f.id)
      return next
    })
  }, [folders, activeFolderId])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <nav aria-label="Mappar" className="flex flex-col gap-1">
      <RootRow active={activeFolderId === null} isAdmin={isAdmin} />
      <ul className="flex flex-col gap-0.5">
        {roots.map((node) => (
          <FolderTreeNode
            key={node.id}
            node={node}
            depth={0}
            activeFolderId={activeFolderId}
            isAdmin={isAdmin}
            expanded={expanded}
            onToggle={toggle}
          />
        ))}
      </ul>
    </nav>
  )
}

function RootRow({ active, isAdmin }: { active: boolean; isAdmin: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ID })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-1 rounded-md pr-1',
        isOver && 'bg-accent ring-2 ring-ring',
      )}
    >
      <Link
        to="/documents"
        search={{ folder: undefined }}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 font-medium text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
        )}
      >
        <LibraryIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">Alla dokument</span>
      </Link>
      <FolderActions folderId={null} folderName={null} isAdmin={isAdmin} />
    </div>
  )
}

function FolderTreeNode({
  node,
  depth,
  activeFolderId,
  isAdmin,
  expanded,
  onToggle,
}: {
  node: FolderNode
  depth: number
  activeFolderId: string | null
  isAdmin: boolean
  expanded: Set<string>
  onToggle: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: folderDropId(node.id) })
  const isActive = node.id === activeFolderId
  const isOpen = expanded.has(node.id)
  const hasChildren = node.children.length > 0

  return (
    <li>
      <div
        ref={setNodeRef}
        style={{ paddingLeft: `${depth * 12}px` }}
        className={cn(
          'flex items-center gap-0.5 rounded-md pr-1',
          isOver && 'bg-accent ring-2 ring-ring',
        )}
      >
        <button
          type="button"
          aria-label={`${isOpen ? 'Fäll ihop' : 'Expandera'} ${node.name}`}
          aria-expanded={hasChildren ? isOpen : undefined}
          onClick={() => hasChildren && onToggle(node.id)}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring',
            !hasChildren && 'invisible',
          )}
        >
          <ChevronRightIcon
            aria-hidden="true"
            className={cn(
              'size-4 transition-transform motion-reduce:transition-none',
              isOpen && 'rotate-90',
            )}
          />
        </button>
        <Link
          to="/documents"
          search={{ folder: node.id }}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
          )}
        >
          {isOpen && hasChildren ? (
            <FolderOpenIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <FolderIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{node.name}</span>
        </Link>
        <FolderActions folderId={node.id} folderName={node.name} isAdmin={isAdmin} />
      </div>
      {hasChildren && isOpen ? (
        <ul className="flex flex-col gap-0.5">
          {node.children.map((child) => (
            <FolderTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFolderId={activeFolderId}
              isAdmin={isAdmin}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
