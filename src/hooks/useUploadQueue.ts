import { useCallback, useState } from 'react'
import type { UploadProgress } from '~/lib/effects/storage/clientUpload'

type QueueEntry = { id: string; name: string; pct: number; status: 'uploading' | 'error' }

/**
 * Owns the transient per-file progress state for a multi-file upload: one entry
 * per in-flight file, removed on success and flipped to `'error'` on failure.
 * `run` fans the supplied `uploadOne` out across all files in parallel and
 * resolves with how many succeeded. Validation, toasts, and query invalidation
 * stay with the caller (those differ per feature); this hook only tracks the
 * progress UI state.
 */
export function useUploadQueue() {
  const [uploads, setUploads] = useState<Array<QueueEntry>>([])

  const run = useCallback(
    async (
      files: Array<File>,
      uploadOne: (file: File, onProgress: (progress: UploadProgress) => void) => Promise<void>,
    ): Promise<{ ok: number }> => {
      const entries = files.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        pct: 0,
        status: 'uploading' as const,
      }))
      setUploads((prev) => [...prev, ...entries])

      const patch = (id: string, next: Partial<QueueEntry>) =>
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...next } : u)))
      const remove = (id: string) => setUploads((prev) => prev.filter((u) => u.id !== id))

      const results = await Promise.all(
        files.map(async (file, i) => {
          const entry = entries[i]
          try {
            await uploadOne(file, (p) => patch(entry.id, { pct: p.percentage }))
            remove(entry.id)
            return true
          } catch {
            patch(entry.id, { status: 'error' })
            return false
          }
        }),
      )

      return { ok: results.filter(Boolean).length }
    },
    [],
  )

  return { uploads, run }
}
