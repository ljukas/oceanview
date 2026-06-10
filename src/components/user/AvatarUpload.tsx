import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ImageUpIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import { Progress } from '~/components/ui/progress'
import { Spinner } from '~/components/ui/spinner'
import { runUploadFlow, type UploadProgress } from '~/lib/effects/storage/clientUpload'
import { orpc } from '~/lib/orpc/client'
import { initials } from '~/lib/utils'
import { m } from '~/paraglide/messages'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif'
const DIRECT_UPLOAD_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const
type DirectUploadMime = (typeof DIRECT_UPLOAD_MIME)[number]
const MAX_BYTES = 5_000_000

function formatBytes(n: number) {
  if (n < 1000) return `${n} B`
  if (n < 1_000_000) return `${Math.round(n / 1000)} kB`
  return `${(n / 1_000_000).toFixed(1)} MB`
}

function isDirectUploadMime(t: string): t is DirectUploadMime {
  return (DIRECT_UPLOAD_MIME as readonly string[]).includes(t)
}

function isHeicCandidate(file: File): boolean {
  const t = file.type.toLowerCase()
  if (t === 'image/heic' || t === 'image/heif') return true
  const n = file.name.toLowerCase()
  return n.endsWith('.heic') || n.endsWith('.heif')
}

async function transcodeHeicToJpeg(file: File): Promise<File> {
  const { heicTo } = await import('heic-to')
  const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.85 })
  const renamed = file.name.replace(/\.(heic|heif)$/i, '.jpg')
  return new File([blob], renamed, { type: 'image/jpeg' })
}

export function AvatarUpload() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [transcoding, setTranscoding] = useState(false)

  const { data: me } = useSuspenseQuery(orpc.user.me.queryOptions())

  const mintMutation = useMutation(orpc.image.mintAvatarUpload.mutationOptions())
  const confirmMutation = useMutation(orpc.image.confirmAvatarUpload.mutationOptions())

  async function handleFile(rawFile: File) {
    try {
      if (rawFile.size > MAX_BYTES) {
        toast.error(m.avatar_error_too_large())
        return
      }

      let file = rawFile
      if (isHeicCandidate(rawFile)) {
        setTranscoding(true)
        try {
          file = await transcodeHeicToJpeg(rawFile)
        } catch {
          toast.error(m.avatar_error_heic_failed())
          return
        } finally {
          setTranscoding(false)
        }
        if (file.size > MAX_BYTES) {
          toast.error(m.avatar_error_too_large_after_conversion())
          return
        }
      } else if (!isDirectUploadMime(rawFile.type)) {
        toast.error(m.avatar_error_unsupported_format())
        return
      }

      const contentType = file.type
      if (!isDirectUploadMime(contentType)) {
        toast.error(m.avatar_error_unknown_format())
        return
      }

      setProgress({ loaded: 0, total: file.size, percentage: 0 })
      await runUploadFlow(file, {
        access: 'public',
        contentType,
        mint: () =>
          mintMutation.mutateAsync({ contentType, sizeBytes: file.size, name: file.name }),
        confirm: (mint) =>
          confirmMutation.mutateAsync({
            pathname: mint.pathname,
            name: file.name,
            sizeBytes: file.size,
          }),
        onProgress: (e) => setProgress(e),
      })

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.user.me.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.user.list.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.user.listContacts.key() }),
      ])
      toast.success(m.avatar_updated())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.avatar_upload_error())
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const busy = transcoding || progress !== null

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-20 shadow-sm">
        {me.image ? (
          <AvatarImage
            src={me.image}
            alt={me.name}
            width={80}
            height={80}
            blurhash={me.imageBlurhash}
          />
        ) : null}
        <AvatarFallback className="font-medium text-lg">{initials(me.name)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />
        <Button
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-fit"
        >
          {busy ? <Spinner data-icon="inline-start" /> : <ImageUpIcon />}
          {me.image ? m.avatar_change_button() : m.avatar_add_button()}
        </Button>
        {transcoding ? (
          <p className="text-muted-foreground text-xs">{m.avatar_transcoding()}</p>
        ) : progress !== null ? (
          <div className="flex w-56 flex-col gap-1">
            <Progress value={progress.percentage} aria-label={m.avatar_uploading_label()} />
            <div className="flex justify-between text-muted-foreground text-xs tabular-nums">
              <span>{progress.percentage} %</span>
              <span>
                {m.avatar_bytes_remaining({
                  amount: formatBytes(Math.max(progress.total - progress.loaded, 0)),
                })}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">{m.avatar_format_hint()}</p>
        )}
      </div>
    </div>
  )
}
