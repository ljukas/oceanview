import { useQueryClient } from '@tanstack/react-query'
import { forwardRef, type ReactNode, useCallback, useImperativeHandle, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { Progress } from '~/components/ui/progress'
import { uploadFileToStorage } from '~/lib/effects/storage/clientUpload'
import { client, orpc } from '~/lib/orpc/client'
import { cn } from '~/lib/utils'

const MAX_BYTES = 100_000_000

type UploadState = { id: string; name: string; pct: number; status: 'uploading' | 'error' }

type Props = {
  folderId: string | null
  children: ReactNode
}

export type DocumentUploadHandle = { open: () => void }

/**
 * Drop zone wrapping the document list. Dragging OS files anywhere over the
 * list runs the three-step upload flow per file in parallel, into the current
 * folder. Progress is announced via aria-live. The file picker is opened via
 * the imperative `open()` handle (the trigger button lives in the page
 * toolbar).
 */
export const DocumentUpload = forwardRef<DocumentUploadHandle, Props>(function DocumentUpload(
  { folderId, children },
  ref,
) {
  const queryClient = useQueryClient()
  const [uploads, setUploads] = useState<Array<UploadState>>([])

  const handleFiles = useCallback(
    async (files: Array<File>) => {
      const accepted = files.filter((f) => {
        if (f.size > MAX_BYTES) {
          toast.error(`"${f.name}" är för stor (max 100 MB)`)
          return false
        }
        return true
      })
      if (accepted.length === 0) return

      const entries = accepted.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        pct: 0,
        status: 'uploading' as const,
      }))
      setUploads((prev) => [...prev, ...entries])

      const patch = (id: string, next: Partial<UploadState>) =>
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...next } : u)))
      const remove = (id: string) => setUploads((prev) => prev.filter((u) => u.id !== id))

      const results = await Promise.all(
        accepted.map(async (file, i) => {
          const entry = entries[i]
          try {
            const mint = await client.document.mintDocumentUpload({
              contentType: file.type || 'application/octet-stream',
              sizeBytes: file.size,
              name: file.name,
            })
            await uploadFileToStorage(file, mint, {
              access: 'private',
              contentType: file.type || 'application/octet-stream',
              onProgress: (p) => patch(entry.id, { pct: p.percentage }),
            })
            await client.document.confirmDocumentUpload({
              pathname: mint.pathname,
              name: file.name,
              sizeBytes: file.size,
              folderId,
            })
            remove(entry.id)
            return true
          } catch (err) {
            patch(entry.id, { status: 'error' })
            toast.error(
              `Kunde inte ladda upp "${file.name}": ${err instanceof Error ? err.message : 'okänt fel'}`,
            )
            return false
          }
        }),
      )

      await queryClient.invalidateQueries({ queryKey: orpc.document.key() })
      // Announce completion via a toast (sonner is a live region) rather than
      // re-announcing every progress tick.
      const ok = results.filter(Boolean).length
      if (ok > 0) {
        toast.success(`${ok} ${ok === 1 ? 'dokument uppladdat' : 'dokument uppladdade'}`)
      }
    },
    [folderId, queryClient],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (files) => void handleFiles(files),
    noClick: true,
    noKeyboard: true,
  })

  useImperativeHandle(ref, () => ({ open }), [open])

  return (
    <div className="flex flex-col gap-3">
      <div
        {...getRootProps()}
        className={cn(
          'relative rounded-lg transition-colors',
          isDragActive && 'outline-dashed outline-2 outline-ring outline-offset-4',
        )}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80">
            <p className="font-medium text-sm">Släpp filerna för att ladda upp…</p>
          </div>
        ) : null}
        {children}
      </div>

      {uploads.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {uploads.map((u) => (
            <li key={u.id} className="flex flex-col gap-1 rounded-md border p-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{u.name}</span>
                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                  {u.status === 'error' ? 'Misslyckades' : `Laddar upp… ${Math.round(u.pct)}%`}
                </span>
              </div>
              {u.status === 'uploading' ? (
                <Progress value={u.pct} aria-label={`Laddar upp ${u.name}`} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
})
