import { createFileRoute } from '@tanstack/react-router'
import { DocumentsView } from '~/components/document/views/DocumentsView'
import { orpc } from '~/lib/orpc/client'
import { m } from '~/paraglide/messages'
import { seo } from '~/utils/seo'

export const Route = createFileRoute('/_authenticated/documents/')({
  head: () => ({
    meta: seo({
      title: `${m.meta_documents_title()} | Oceanview`,
      description: m.meta_documents_description(),
    }),
  }),
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(orpc.folder.tree.queryOptions()),
      queryClient.ensureQueryData(
        orpc.document.listDocuments.queryOptions({ input: { folderId: null } }),
      ),
    ])
  },
  component: DocumentsRoot,
})

function DocumentsRoot() {
  const { user } = Route.useRouteContext()
  return <DocumentsView activeFolderId={null} currentUser={user} />
}
