import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { DocumentList } from '~/components/document/DocumentList'
import { DocumentUpload } from '~/components/document/DocumentUpload'
import { orpc } from '~/lib/orpc/client'
import { seo } from '~/utils/seo'

export const Route = createFileRoute('/_authenticated/documents')({
  head: () => ({
    meta: seo({
      title: 'Dokument | Oceanview',
      description: 'Delade dokument för båtens samägare',
    }),
  }),
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(orpc.file.listDocuments.queryOptions())
  },
  component: Documents,
})

function Documents() {
  const { user } = Route.useRouteContext()
  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">Dokument</h1>
        <p className="text-muted-foreground text-sm">
          Delat bibliotek för båtens samägare. Alla kan ladda ner; du kan radera dina egna filer.
        </p>
      </header>

      <div>
        <DocumentUpload />
      </div>

      <Suspense fallback={<div className="text-muted-foreground text-sm">Laddar dokument…</div>}>
        <DocumentList currentUser={{ id: user.id, role: user.role }} />
      </Suspense>
    </div>
  )
}
