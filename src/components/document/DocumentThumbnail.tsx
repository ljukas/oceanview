import { useQuery } from '@tanstack/react-query'
import { blurhashToCssGradientString } from '@unpic/placeholder'
import { FileIcon, FileTextIcon } from 'lucide-react'
import { useMemo } from 'react'
import { SHARP_DECODABLE_MIME_SET } from '~/lib/image/blurhash'
import { orpc } from '~/lib/orpc/client'
import { cn } from '~/lib/utils'

type Props = {
  id: string
  mime: string
  blurhash: string | null
  className?: string
}

// Signed preview URLs expire (1 h server TTL); refetch a little before that so
// a long-lived tile never points at a dead URL.
const PREVIEW_STALE_MS = 50 * 60 * 1000

/**
 * Tile preview for a document. Image mimes lazily fetch a signed storage URL
 * *after* render (so the grid paints instantly) and load it directly as an
 * <img> — the app download route can't serve <img> requests (Sec-Fetch-Dest:
 * image → 404). The blurhash, when present, paints behind so the tile is never
 * an empty box while the URL resolves. PDFs and other mimes get a mime icon.
 *
 * Rendered WebP thumbnails are deferred (ADR-0010); when that worker lands the
 * `previewUrl` procedure can prefer the public thumbnail with no change here.
 */
export function DocumentThumbnail({ id, mime, blurhash, className }: Props) {
  const isImage = SHARP_DECODABLE_MIME_SET.has(mime)
  const gradient = useMemo(
    () => (blurhash ? blurhashToCssGradientString(blurhash) : null),
    [blurhash],
  )

  const { data } = useQuery({
    ...orpc.document.previewUrl.queryOptions({ input: { id } }),
    enabled: isImage,
    staleTime: PREVIEW_STALE_MS,
  })

  if (!isImage) {
    const Icon = mime === 'application/pdf' ? FileTextIcon : FileIcon
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-md bg-muted text-muted-foreground',
          className,
        )}
      >
        <Icon aria-hidden="true" className="size-1/3" />
      </div>
    )
  }

  return (
    <div
      className={cn('relative overflow-hidden rounded-md bg-muted', className)}
      style={gradient ? { backgroundImage: gradient } : undefined}
    >
      {data?.url ? (
        <img
          src={data.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : null}
    </div>
  )
}
