import { DndContext, DragOverlay } from '@dnd-kit/core'
import { useSuspenseQuery } from '@tanstack/react-query'
import { FolderIcon, FolderPlusIcon, UploadIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CreateFolderDialog } from '~/components/document/CreateFolderDialog'
import { DocumentSearch } from '~/components/document/DocumentSearch'
import { DocumentSelectionBar } from '~/components/document/DocumentSelectionBar'
import { DocumentTable } from '~/components/document/DocumentTable'
import { DocumentThumbnail } from '~/components/document/DocumentThumbnail'
import { DocumentUpload, type DocumentUploadHandle } from '~/components/document/DocumentUpload'
import { documentDisplayName } from '~/components/document/documentHelpers'
import { FolderBreadcrumb } from '~/components/document/FolderBreadcrumb'
import { Button } from '~/components/ui/button'
import { useDocumentDnd } from '~/hooks/useDocumentDnd'
import { orpc } from '~/lib/orpc/client'

type Props = {
  /** Resolved folder id from the URL, or null for the virtual root. */
  activeFolderId: string | null
  currentUser: { id: string; role?: string | null }
}

/**
 * The documents library view, shared by the root index route and the
 * `/documents/$` splat route. `activeFolderId` is the only thing that differs
 * between them — the root passes null, the splat passes its resolved folder id.
 */
export function DocumentsView({ activeFolderId, currentUser }: Props) {
  const isAdmin = currentUser.role === 'admin'

  const { data: folders } = useSuspenseQuery(orpc.folder.tree.queryOptions())
  const { data: visibleDocuments } = useSuspenseQuery(
    orpc.document.listDocuments.queryOptions({ input: { folderId: activeFolderId } }),
  )

  const uploadRef = useRef<DocumentUploadHandle>(null)
  const [createOpen, setCreateOpen] = useState(false)

  // Selection is owned here so both the table (rendering + range) and the dnd
  // hook (group drag) can read it. A single folder can be selected instead —
  // mutually exclusive with docs, matching OS file browsers (double-click a
  // folder to navigate in).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setSelectedFolderId(null)
  }, [])
  const selectDocuments = useCallback((next: Set<string>) => {
    setSelectedFolderId(null)
    setSelected(next)
  }, [])
  const selectFolder = useCallback((id: string) => {
    setSelected(new Set())
    setSelectedFolderId(id)
  }, [])

  // The selected folder belongs to the current view; reset it on navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset must re-run when the viewed folder changes
  useEffect(() => {
    setSelectedFolderId(null)
  }, [activeFolderId])

  // Drop doc ids that leave the view — moved/deleted or a realtime invalidate.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const valid = new Set(visibleDocuments.map((d) => d.id))
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (valid.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [visibleDocuments])

  const selectedIds = useMemo(() => [...selected], [selected])
  const canEditAll = useMemo(
    () =>
      selectedIds.length > 0 &&
      selectedIds.every((id) => {
        const d = visibleDocuments.find((v) => v.id === id)
        return !!d && (d.ownerId === currentUser.id || currentUser.role === 'admin')
      }),
    [selectedIds, visibleDocuments, currentUser],
  )

  const { dndContextProps, activeDoc, activeFolder, activeCount, dropAnimation } = useDocumentDnd({
    activeFolderId,
    visibleDocuments,
    folders,
    selectedIds,
    clearSelection,
  })

  return (
    <DndContext {...dndContextProps}>
      <div className="flex flex-col gap-4 p-4 md:p-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">Dokument</h1>
            <p className="text-muted-foreground text-sm">
              Delat bibliotek för båtens samägare. Dra dokument mellan mappar eller ladda upp nya.
            </p>
          </div>
          <DocumentSearch />
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <FolderBreadcrumb folders={folders} activeFolderId={activeFolderId} />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <FolderPlusIcon data-icon="inline-start" />
              Ny mapp
            </Button>
            <Button onClick={() => uploadRef.current?.open()}>
              <UploadIcon data-icon="inline-start" />
              Ladda upp dokument
            </Button>
          </div>
        </div>

        <DocumentUpload ref={uploadRef} folderId={activeFolderId}>
          <div className="flex flex-col gap-4">
            <DocumentSelectionBar
              selectedIds={selectedIds}
              folderId={activeFolderId}
              canEditAll={canEditAll}
              clearSelection={clearSelection}
            />
            <DocumentTable
              documents={visibleDocuments}
              currentUser={currentUser}
              folders={folders}
              activeFolderId={activeFolderId}
              isAdmin={isAdmin}
              selected={selected}
              setSelected={selectDocuments}
              selectedFolderId={selectedFolderId}
              selectFolder={selectFolder}
              canEditAll={canEditAll}
              clearSelection={clearSelection}
            />
          </div>
        </DocumentUpload>
      </div>

      {createOpen ? (
        <CreateFolderDialog
          open
          onOpenChange={() => setCreateOpen(false)}
          parentId={activeFolderId}
        />
      ) : null}

      {/* Portaled drag ghost — follows the pointer and isn't clipped by the
          table's overflow container the way the source row would be. A group
          drag shows a count badge. */}
      <DragOverlay dropAnimation={dropAnimation}>
        {activeDoc ? (
          <div
            data-drag-card
            className="relative flex max-w-xs items-center gap-3 rounded-lg border bg-card p-2 shadow-lg"
          >
            <DocumentThumbnail
              id={activeDoc.id}
              mime={activeDoc.mime}
              extension={activeDoc.extension}
              blurhash={activeDoc.blurhash}
              thumbnailPathname={activeDoc.thumbnailPathname}
              className="size-9 shrink-0"
            />
            <span className="truncate font-medium text-sm">{documentDisplayName(activeDoc)}</span>
            {activeCount > 1 ? (
              <span
                aria-hidden="true"
                className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-selected font-medium text-selected-foreground text-xs tabular-nums shadow-sm"
              >
                {activeCount}
              </span>
            ) : null}
          </div>
        ) : activeFolder ? (
          <div
            data-drag-card
            className="flex max-w-xs items-center gap-3 rounded-lg border bg-card p-2 shadow-lg"
          >
            <div className="flex size-9 shrink-0 items-center justify-center">
              <FolderIcon aria-hidden="true" className="size-5 text-muted-foreground" />
            </div>
            <span className="truncate font-medium text-sm">{activeFolder.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
