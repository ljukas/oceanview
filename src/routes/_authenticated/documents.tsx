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
import { FolderTreeIcon } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { DocumentGrid } from '~/components/document/DocumentGrid'
import { DocumentSearch } from '~/components/document/DocumentSearch'
import { DocumentTree } from '~/components/document/DocumentTree'
import { DocumentUpload } from '~/components/document/DocumentUpload'
import { parseFolderDropId } from '~/components/document/documentHelpers'
import { FolderBreadcrumb } from '~/components/document/FolderBreadcrumb'
import { Button } from '~/components/ui/button'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '~/components/ui/sheet'
import { useIsMobile } from '~/hooks/useMobile'
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

  // Render the tree in exactly one place — a second (CSS-hidden) instance would
  // register every folder's droppable id twice in this DndContext.
  const isMobile = useIsMobile()
  const tree = <DocumentTree folders={folders} activeFolderId={activeFolderId} isAdmin={isAdmin} />

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

        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          {/* Tree: inline rail on desktop, drawer on mobile — mounted once. */}
          {!isMobile ? (
            <aside>
              <ScrollArea className="h-[calc(100vh-12rem)] pr-2">{tree}</ScrollArea>
            </aside>
          ) : null}

          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex items-center gap-2">
              {isMobile ? (
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm">
                      <FolderTreeIcon data-icon="inline-start" />
                      Mappar
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-72">
                    <SheetHeader>
                      <SheetTitle>Mappar</SheetTitle>
                    </SheetHeader>
                    <ScrollArea className="h-full px-4 pb-4">{tree}</ScrollArea>
                  </SheetContent>
                </Sheet>
              ) : null}
              <FolderBreadcrumb folders={folders} activeFolderId={activeFolderId} />
            </div>

            <DocumentUpload folderId={activeFolderId}>
              <DocumentGrid documents={visibleDocuments} currentUser={user} />
            </DocumentUpload>
          </div>
        </div>
      </div>
    </DndContext>
  )
}
