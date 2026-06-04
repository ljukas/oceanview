import { DndContext, DragOverlay } from '@dnd-kit/core'
import { useSuspenseQuery } from '@tanstack/react-query'
import { FolderPlusIcon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { CreateFolderDialog } from '~/components/document/CreateFolderDialog'
import { DocumentSearch } from '~/components/document/DocumentSearch'
import { DocumentTable } from '~/components/document/DocumentTable'
import { DocumentThumbnail } from '~/components/document/DocumentThumbnail'
import { DocumentUpload, type DocumentUploadHandle } from '~/components/document/DocumentUpload'
import { documentDisplayName } from '~/components/document/documentHelpers'
import { FolderBar } from '~/components/document/FolderBar'
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

  const { dndContextProps, activeDoc, dropAnimation } = useDocumentDnd({
    activeFolderId,
    visibleDocuments,
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
            <FolderBar folders={folders} activeFolderId={activeFolderId} isAdmin={isAdmin} />
            <DocumentTable documents={visibleDocuments} currentUser={currentUser} />
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
          table's overflow container the way the source row would be. */}
      <DragOverlay dropAnimation={dropAnimation}>
        {activeDoc ? (
          <div
            data-drag-card
            className="flex max-w-xs items-center gap-3 rounded-lg border bg-card p-2 shadow-lg"
          >
            <DocumentThumbnail
              id={activeDoc.id}
              mime={activeDoc.mime}
              extension={activeDoc.extension}
              blurhash={activeDoc.blurhash}
              className="size-9 shrink-0"
            />
            <span className="truncate font-medium text-sm">{documentDisplayName(activeDoc)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
