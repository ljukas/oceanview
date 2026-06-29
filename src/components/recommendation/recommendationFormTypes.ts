// The editor's photo view-model. The form field holds an ordered FormPhoto[] (the
// single source of truth for membership + order). 'existing' carries display data
// (url/blurhash) read-only; 'new' carries the local preview + upload status. Submit
// maps to the procedure shapes via the helpers below. A new photo has no `pathname`
// until its upload resolves — that's how we know an upload is still in flight.
export type FormPhoto =
  | { kind: 'existing'; photoId: string; url: string; blurhash: string | null }
  | {
      kind: 'new'
      localId: string
      pathname?: string
      sizeBytes: number
      previewUrl: string
      status: 'uploading' | 'done' | 'error'
    }

export function photoKey(p: FormPhoto): string {
  return p.kind === 'existing' ? p.photoId : p.localId
}

export function photosUploading(photos: FormPhoto[]): boolean {
  return photos.some((p) => p.kind === 'new' && p.status !== 'done')
}

/** create input: all photos are freshly uploaded (must be 'done' with a pathname). */
export function toCreatePhotos(photos: FormPhoto[]): { pathname: string; sizeBytes: number }[] {
  return photos.flatMap((p) =>
    p.kind === 'new' && p.pathname ? [{ pathname: p.pathname, sizeBytes: p.sizeBytes }] : [],
  )
}

/** update input: existing kept by id + new uploads, preserving order. */
type UpdatePhoto =
  | { kind: 'existing'; photoId: string }
  | { kind: 'new'; pathname: string; sizeBytes: number }

export function toUpdatePhotos(photos: FormPhoto[]): UpdatePhoto[] {
  return photos.flatMap<UpdatePhoto>((p) => {
    if (p.kind === 'existing') return [{ kind: 'existing', photoId: p.photoId }]
    return p.pathname ? [{ kind: 'new', pathname: p.pathname, sizeBytes: p.sizeBytes }] : []
  })
}
