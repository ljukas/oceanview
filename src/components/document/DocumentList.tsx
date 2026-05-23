import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { blurhashToCssGradientString } from '@unpic/placeholder'
import { Image } from '@unpic/react/base'
import { DownloadIcon, FileIcon, Trash2Icon } from 'lucide-react'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { SHARP_DECODABLE_MIME_SET } from '~/lib/image/blurhash'
import { transformer } from '~/lib/image/transformer'
import { orpc } from '~/lib/orpc/client'
import type { DocumentRow } from '~/lib/services/file'

type CurrentUser = {
  id: string
  role?: string | null
}

const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentList({ currentUser }: { currentUser: CurrentUser }) {
  const queryClient = useQueryClient()
  const { data: documents } = useSuspenseQuery(orpc.file.listDocuments.queryOptions())

  const deleteMutation = useMutation(
    orpc.file.deleteDocument.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.file.listDocuments.key() })
        toast.success('Dokumentet togs bort')
      },
      onError: (err) => {
        toast.error(err.message || 'Kunde inte ta bort dokumentet')
      },
    }),
  )

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border bg-card p-8 text-center">
        <FileIcon className="size-8 text-muted-foreground" />
        <p className="font-medium text-sm">Inga dokument än</p>
        <p className="text-muted-foreground text-sm">
          Ladda upp manualer, försäkringspapper eller annan dokumentation som rör båten.
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y rounded-lg border bg-card">
      {documents.map((doc) => {
        const canDelete = doc.ownerId === currentUser.id || currentUser.role === 'admin'
        return (
          <li key={doc.id} className="flex items-center gap-3 p-4">
            <DocumentThumbnail file={doc} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="break-words font-medium text-sm">{doc.name}</span>
              <span className="text-muted-foreground text-xs">
                {`Uppladdad av ${doc.ownerName} • ${dateFormatter.format(doc.uploadedAt)} • ${formatSize(doc.sizeBytes)}`}
              </span>
            </div>
            <Button asChild variant="outline" size="icon-sm" aria-label="Ladda ner">
              <a href={`/api/files/download/${doc.id}`} target="_blank" rel="noopener noreferrer">
                <DownloadIcon />
              </a>
            </Button>
            {canDelete && (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Ta bort"
                className="text-destructive hover:text-destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ id: doc.id })}
              >
                {deleteMutation.isPending && deleteMutation.variables?.id === doc.id ? (
                  <Spinner />
                ) : (
                  <Trash2Icon />
                )}
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// Image-mime documents get a real thumbnail; everything else falls back
// to the generic file icon. The blurhash (when present) paints behind
// the unpic image so the row never shows an empty box.
function DocumentThumbnail({ file }: { file: DocumentRow }) {
  const isImage = SHARP_DECODABLE_MIME_SET.has(file.mime)
  const gradient = useMemo(
    () => (file.blurhash ? blurhashToCssGradientString(file.blurhash) : null),
    [file.blurhash],
  )
  if (!isImage) {
    return <FileIcon className="size-5 shrink-0 text-muted-foreground" />
  }
  return (
    <div
      className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted"
      style={gradient ? { backgroundImage: gradient } : undefined}
    >
      <Image
        src={`/api/files/download/${file.id}`}
        alt=""
        width={40}
        height={40}
        layout="constrained"
        transformer={transformer}
        className="size-full object-cover"
      />
    </div>
  )
}
