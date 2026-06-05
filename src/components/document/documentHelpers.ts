import {
  FileArchiveIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileTypeIcon,
  type LucideIcon,
  PresentationIcon,
  SheetIcon,
} from 'lucide-react'
import type { RouterOutputs } from '~/lib/orpc/client'
import { joinFilename } from '~/utils/filename'

// Row shapes derived from the router — no hand-maintained duplicates.
export type DocumentRow = RouterOutputs['document']['listDocuments'][number]
export type FolderRow = RouterOutputs['folder']['tree'][number]
export type BinEntry = RouterOutputs['bin']['list'][number]

/**
 * Split flat bin entries into restorable groups. Cascade deletes share a
 * `correlationId` → one batch restored together; entries without one were
 * deleted individually → `loose`, restored/purged per item. Insertion order is
 * preserved (Map keeps first-seen order; `loose` keeps array order), so the
 * rendered list mirrors the server's ordering.
 */
export function partitionBinEntries(entries: ReadonlyArray<BinEntry>): {
  batches: Map<string, Array<BinEntry>>
  loose: Array<BinEntry>
} {
  const batches = new Map<string, Array<BinEntry>>()
  const loose: Array<BinEntry> = []
  for (const entry of entries) {
    if (entry.correlationId) {
      const list = batches.get(entry.correlationId) ?? []
      list.push(entry)
      batches.set(entry.correlationId, list)
    } else {
      loose.push(entry)
    }
  }
  return { batches, loose }
}

/**
 * Full filename for display: the stored base `name` plus its `.extension`.
 * The two are stored separately so the extension can't be renamed; rejoin
 * them everywhere a document name is shown.
 */
export function documentDisplayName(doc: { name: string; extension?: string | null }): string {
  return joinFilename(doc)
}

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

/**
 * Strip the leading/trailing slashes off a stored folder `path`
 * (`/Manuals/Engine/` → `Manuals/Engine`) to feed the `/documents/$` splat.
 * The router percent-encodes each segment, so pass the raw (decoded) string.
 */
export function folderPathToSplat(path: string): string {
  return path.replace(/^\/+|\/+$/g, '')
}

/**
 * Resolve a decoded `/documents/$` splat (`Manuals/Engine`) to its folder by
 * matching the stored `path` column in the flat tree. Returns null for the
 * empty splat (root) or a path that no longer exists (renamed/moved/deleted).
 *
 * Both sides are NFC-normalized: encode/decode is byte-faithful and won't
 * reconcile precomposed vs decomposed å/ä/ö, so a bare `===` could miss. This
 * is a read-time guard only — no migration.
 */
export function resolveFolderBySplat(
  folders: Array<FolderRow>,
  splat: string | undefined,
): FolderRow | null {
  if (!splat) return null
  const trimmed = splat.replace(/^\/+|\/+$/g, '')
  if (trimmed === '') return null
  const target = `/${trimmed}/`.normalize('NFC')
  return folders.find((f) => f.path.normalize('NFC') === target) ?? null
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

// File-type tile icon + brand color. File-type colors (PDF red, Word blue,
// Excel green, …) are a deliberate exception to the "semantic colors only" rule
// — conventional and instantly recognisable, like the icon-rail tooltips. We map
// known mimes to a family, falling back to the lowercased extension because
// browser uploads sometimes send a generic/empty contentType (ADR-0010 §M: no
// mime whitelist).
type FileFamily = 'pdf' | 'word' | 'excel' | 'csv' | 'presentation' | 'archive' | 'text'

const FAMILY_BY_MIME: Record<string, FileFamily> = {
  'application/pdf': 'pdf',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'text/csv': 'csv',
  'application/vnd.ms-powerpoint': 'presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  'application/zip': 'archive',
  'application/x-zip-compressed': 'archive',
  'application/vnd.rar': 'archive',
  'application/x-rar-compressed': 'archive',
  'application/x-7z-compressed': 'archive',
  'application/gzip': 'archive',
  'application/x-tar': 'archive',
  'text/plain': 'text',
}

const FAMILY_BY_EXTENSION: Record<string, FileFamily> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  xls: 'excel',
  xlsx: 'excel',
  csv: 'csv',
  ppt: 'presentation',
  pptx: 'presentation',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  gz: 'archive',
  tar: 'archive',
  txt: 'text',
}

const APPEARANCE_BY_FAMILY: Record<FileFamily, { Icon: LucideIcon; className: string }> = {
  pdf: { Icon: FileTextIcon, className: 'text-red-600 dark:text-red-500' },
  word: { Icon: FileTypeIcon, className: 'text-blue-600 dark:text-blue-500' },
  excel: { Icon: FileSpreadsheetIcon, className: 'text-green-600 dark:text-green-500' },
  // Spreadsheet-family, same green as Excel but a distinct icon — CSVs open in
  // sheet apps yet aren't xlsx workbooks.
  csv: { Icon: SheetIcon, className: 'text-green-600 dark:text-green-500' },
  presentation: { Icon: PresentationIcon, className: 'text-orange-600 dark:text-orange-500' },
  archive: { Icon: FileArchiveIcon, className: 'text-amber-600 dark:text-amber-500' },
  text: { Icon: FileTextIcon, className: 'text-muted-foreground' },
}

const FALLBACK_APPEARANCE = { Icon: FileIcon, className: 'text-muted-foreground' }

/**
 * Icon + color class for a document tile, keyed by mime with an extension
 * fallback. Returns a generic muted file icon for unknown types.
 */
export function fileTypeAppearance(file: { mime: string; extension?: string | null }): {
  Icon: LucideIcon
  className: string
} {
  const family =
    FAMILY_BY_MIME[file.mime.toLowerCase()] ??
    (file.extension ? FAMILY_BY_EXTENSION[file.extension.toLowerCase()] : undefined)
  return family ? APPEARANCE_BY_FAMILY[family] : FALLBACK_APPEARANCE
}
