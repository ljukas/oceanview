import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { FolderPlusIcon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { CreateFolderDialog } from '~/components/document/CreateFolderDialog'
import { DocumentSearch } from '~/components/document/DocumentSearch'
import { DocumentTable } from '~/components/document/DocumentTable'
import { DocumentUpload, type DocumentUploadHandle } from '~/components/document/DocumentUpload'
import { parseFolderDropId } from '~/components/document/documentHelpers'
import { FolderBar } from '~/components/document/FolderBar'
import { FolderBreadcrumb } from '~/components/document/FolderBreadcrumb'
import { Button } from '~/components/ui/button'
import { orpc } from '~/lib/orpc/client'
import { seo } from '~/utils/seo'

const documentsSearchSchema = z.object({ folder: z.uuid().optional() })

export const Route = createFileRoute('/_authenticated/documents')({
  head: () => ({
    meta: seo({
      title: 'Dokument | Oceanview',
      description: 'Delade dokument för båtens samägare',
    }),
  }),
  validateSearch: documentsSearchSchema,
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(orpc.folder.tree.queryOptions()),
      queryClient.ensureQueryData(orpc.document.listDocuments.queryOptions()),
    ])
  },
  component: Documents,
})

function Documents() {
  const { user } = Route.useRouteContext()
  const isAdmin = user.role === 'admin'
  const activeFolderId = Route.useSearch({ select: (s) => s.folder ?? null })
  const queryClient = useQueryClient()

  const { data: folders } = useSuspenseQuery(orpc.folder.tree.queryOptions())
  const { data: documents } = useSuspenseQuery(orpc.document.listDocuments.queryOptions())
  const visibleDocuments = documents.filter((d) => d.folderId === activeFolderId)

  const uploadRef = useRef<DocumentUploadHandle>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const moveMutation = useMutation(
    orpc.document.moveDocument.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.document.key() })
        toast.success('Dokumentet flyttades')
      },
      onError: (err) => toast.error(err.message || 'Kunde inte flytta dokumentet'),
    }),
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  function onDragEnd(event: DragEndEvent) {
    const documentId = event.active.data.current?.documentId as string | undefined
    if (!documentId || !event.over) return
    const target = parseFolderDropId(String(event.over.id))
    if (target === undefined) return
    const doc = documents.find((d) => d.id === documentId)
    if (!doc || doc.folderId === target) return
    moveMutation.mutate({ id: documentId, folderId: target })
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
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
            <DocumentTable documents={visibleDocuments} currentUser={user} />
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
    </DndContext>
  )
}
