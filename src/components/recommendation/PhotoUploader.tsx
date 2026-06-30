import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation } from '@tanstack/react-query'
import { ImagePlusIcon, XIcon } from 'lucide-react'
import { memo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Progress } from '~/components/ui/progress'
import { Spinner } from '~/components/ui/spinner'
import { runUploadFlow } from '~/lib/effects/storage/clientUpload'
import { readGpsFromFile } from '~/lib/files/exif'
import { isHeicCandidate, transcodeHeicToJpeg } from '~/lib/image/heic'
import { orpc } from '~/lib/orpc/client'
import { UPLOAD_IMAGE_MIME } from '~/lib/orpc/imageUpload'
import { cn } from '~/lib/utils'
import { m } from '~/paraglide/messages'
import { type FormPhoto, photoKey } from './recommendationFormTypes'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif'
const MAX_BYTES = 15_000_000

type UploadMime = (typeof UPLOAD_IMAGE_MIME)[number]
// Narrowing guard: confirms a raw `File.type` is one of the directly-uploadable
// MIME types, so the value flows into `mintImageUpload`'s typed `contentType`.
function isDirectMime(type: string): type is UploadMime {
  return (UPLOAD_IMAGE_MIME as readonly string[]).includes(type)
}

function uid(): string {
  // No crypto.randomUUID dependency needed; uniqueness only within this mount.
  return `p_${Math.random().toString(36).slice(2)}_${performance.now()}`
}

export function PhotoUploader({
  value,
  onChange,
  onExifLocation,
}: {
  value: FormPhoto[]
  onChange: (next: FormPhoto[]) => void
  onExifLocation?: (loc: { lat: number; lng: number }) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  // Transient per-upload progress %, keyed by localId — presentation only, NOT a
  // field value (mirrors AvatarUpload's local `progress`). Reordering/membership
  // live in the form field via `value`/`onChange`.
  const [progress, setProgress] = useState<Record<string, number>>({})
  const mintMutation = useMutation(orpc.recommendation.mintImageUpload.mutationOptions())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // `value` is captured per-call below via a ref so concurrent uploads append
  // correctly without stale closures.
  const valueRef = useRef(value)
  valueRef.current = value

  async function addFiles(files: File[]) {
    let exifReported = value.some((p) => p.kind === 'existing') // don't override on edit
    for (const raw of files) {
      if (valueRef.current.length >= 10) {
        toast.error(m.recommendation_photo_max())
        break
      }
      // EXIF on the ORIGINAL file, before transcode (transcode strips metadata).
      if (!exifReported && onExifLocation) {
        const gps = await readGpsFromFile(raw)
        if (gps) {
          onExifLocation(gps)
          exifReported = true
        }
      }

      let file = raw
      if (isHeicCandidate(raw)) {
        try {
          file = await transcodeHeicToJpeg(raw)
        } catch {
          toast.error(m.recommendation_photo_heic_failed())
          continue
        }
      } else if (!isDirectMime(raw.type)) {
        toast.error(m.recommendation_photo_unsupported())
        continue
      }
      if (file.size > MAX_BYTES) {
        toast.error(m.recommendation_photo_too_large())
        continue
      }
      const contentType = file.type
      if (!isDirectMime(contentType)) {
        toast.error(m.recommendation_photo_unsupported())
        continue
      }

      const localId = uid()
      const previewUrl = URL.createObjectURL(file)
      const slot: FormPhoto = {
        kind: 'new',
        localId,
        sizeBytes: file.size,
        previewUrl,
        status: 'uploading',
      }
      onChange([...valueRef.current, slot])

      try {
        let pathname = ''
        await runUploadFlow(file, {
          access: 'public',
          contentType,
          mint: async () => {
            const minted = await mintMutation.mutateAsync({
              contentType,
              sizeBytes: file.size,
              name: file.name,
            })
            pathname = minted.pathname
            return minted
          },
          confirm: async () => {}, // no confirm step — pathname is submitted with the form
          onProgress: (e) => setProgress((p) => ({ ...p, [localId]: e.percentage })),
        })
        onChange(
          valueRef.current.map((p) =>
            p.kind === 'new' && p.localId === localId ? { ...p, pathname, status: 'done' } : p,
          ),
        )
      } catch {
        toast.error(m.recommendation_photo_upload_error())
        onChange(
          valueRef.current.map((p) =>
            p.kind === 'new' && p.localId === localId ? { ...p, status: 'error' } : p,
          ),
        )
      } finally {
        setProgress((p) => {
          const { [localId]: _drop, ...rest } = p
          return rest
        })
      }
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  function removeAt(key: string) {
    const target = value.find((p) => photoKey(p) === key)
    if (target?.kind === 'new') URL.revokeObjectURL(target.previewUrl)
    onChange(value.filter((p) => photoKey(p) !== key))
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = value.findIndex((p) => photoKey(p) === active.id)
    const to = value.findIndex((p) => photoKey(p) === over.id)
    if (from < 0 || to < 0) return
    onChange(arrayMove(value, from, to))
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) void addFiles(files)
        }}
      />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={value.map(photoKey)} strategy={horizontalListSortingStrategy}>
          <div className="flex flex-wrap gap-3">
            {value.map((p, i) => (
              <PhotoTile
                key={photoKey(p)}
                photo={p}
                isCover={i === 0}
                progress={p.kind === 'new' ? progress[p.localId] : undefined}
                onRemove={() => removeAt(photoKey(p))}
              />
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              className="size-24 flex-col gap-1 border-dashed"
            >
              <ImagePlusIcon />
              <span className="text-xs">{m.recommendation_photo_add()}</span>
            </Button>
          </div>
        </SortableContext>
      </DndContext>
      <p className="text-muted-foreground text-xs">{m.recommendation_photos_hint()}</p>
    </div>
  )
}

// Memoized so reordering/uploading one tile doesn't re-render the whole strip:
// each tile only re-renders when its own photo/cover/progress identity changes.
const PhotoTile = memo(function PhotoTile({
  photo,
  isCover,
  progress,
  onRemove,
}: {
  photo: FormPhoto
  isCover: boolean
  progress: number | undefined
  onRemove: () => void
}) {
  const id = photoKey(photo)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  const src = photo.kind === 'existing' ? photo.url : photo.previewUrl
  const uploading = photo.kind === 'new' && photo.status === 'uploading'
  const failed = photo.kind === 'new' && photo.status === 'error'
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative size-24 overflow-hidden rounded-lg border bg-muted',
        isDragging && 'z-10 opacity-80',
      )}
      {...attributes}
      {...listeners}
    >
      {/* Plain <img> on object-URL/known URL — no transformer needed for a local preview.
          src may be null for an existing photo with a pending/failed transcode; coerce
          to undefined so we render the bare muted box rather than a broken image. */}
      <img src={src ?? undefined} alt="" className="size-full object-cover" />
      {isCover ? (
        <span className="absolute top-1 left-1 rounded bg-foreground/70 px-1.5 py-0.5 text-[10px] text-background">
          {m.recommendation_photo_cover()}
        </span>
      ) : null}
      {uploading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-foreground/40 text-background">
          <Spinner />
          {typeof progress === 'number' ? <Progress value={progress} className="w-16" /> : null}
        </div>
      ) : null}
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-destructive/70 text-center text-[10px] text-background">
          {m.recommendation_photo_failed()}
        </div>
      ) : null}
      <button
        type="button"
        aria-label={m.recommendation_photo_remove()}
        onClick={onRemove}
        onPointerDown={(e) => e.stopPropagation()} // don't start a drag from the remove button
        className="absolute top-1 right-1 rounded-full bg-foreground/70 p-1 text-background hover:bg-foreground"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
})
