import type { RouterOutputs } from '~/lib/orpc/client'

// Row shapes derived from the router — no hand-maintained duplicates.
export type DocumentRow = RouterOutputs['document']['listDocuments'][number]
export type FolderRow = RouterOutputs['folder']['tree'][number]

export type CurrentUser = { id: string; role?: string | null }

export const documentDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export type FolderNode = FolderRow & { children: Array<FolderNode> }

/**
 * Build the folder forest from the flat `folder.tree` list (already ordered by
 * `path`). Roots are folders with `parentId === null`. One pass: index by id,
 * then link children to parents.
 */
export function buildFolderTree(folders: Array<FolderRow>): Array<FolderNode> {
  const byId = new Map<string, FolderNode>()
  for (const f of folders) byId.set(f.id, { ...f, children: [] })
  const roots: Array<FolderNode> = []
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)?.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

/**
 * Breadcrumb trail (root → current) for a folder id, resolved against the flat
 * tree. Returns [] for the virtual root. Walks `parentId` up from the target.
 */
export function folderTrail(folders: Array<FolderRow>, folderId: string | null): Array<FolderRow> {
  if (!folderId) return []
  const byId = new Map(folders.map((f) => [f.id, f]))
  const trail: Array<FolderRow> = []
  let current = byId.get(folderId)
  // Guard against a malformed cycle with a depth cap.
  for (let i = 0; current && i < 64; i += 1) {
    trail.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return trail
}

// dnd-kit droppable/draggable id helpers — keep the string scheme in one place.
export const ROOT_DROP_ID = 'folder:root'
export const folderDropId = (folderId: string) => `folder:${folderId}`
export const documentDragId = (documentId: string) => `document:${documentId}`

/** Parse a droppable id back to a target folderId (null = root), or undefined. */
export function parseFolderDropId(id: string): string | null | undefined {
  if (id === ROOT_DROP_ID) return null
  if (id.startsWith('folder:')) return id.slice('folder:'.length)
  return undefined
}
