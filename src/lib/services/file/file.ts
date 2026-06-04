import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { file } from '~/lib/db/schema'
import { FileDomainError } from './errors'

export type FileAccess = 'public' | 'private'

export type FileRow = {
  id: string
  ownerId: string
  pathname: string
  mime: string
  sizeBytes: number
  access: FileAccess
  blurhash: string | null
  uploadedAt: Date
  deletedAt: Date | null
}

export type AvatarUploadInput = {
  pathname: string
  mime: string
  sizeBytes: number
}

const fileSelection = {
  id: file.id,
  ownerId: file.ownerId,
  pathname: file.pathname,
  mime: file.mime,
  sizeBytes: file.sizeBytes,
  access: file.access,
  blurhash: file.blurhash,
  uploadedAt: file.uploadedAt,
  deletedAt: file.deletedAt,
}

export async function findById(id: string): Promise<FileRow | null> {
  const [row] = await db.select(fileSelection).from(file).where(eq(file.id, id)).limit(1)
  return row ?? null
}

export async function findActiveById(id: string): Promise<FileRow | null> {
  const row = await findById(id)
  if (!row || row.deletedAt) return null
  return row
}

export async function setBlurhash(input: { fileId: string; blurhash: string }): Promise<void> {
  await db
    .update(file)
    .set({ blurhash: input.blurhash })
    .where(and(eq(file.id, input.fileId), isNull(file.deletedAt)))
}

/**
 * Insert a new public file row for the user's avatar and soft-delete any
 * previously active public rows owned by that user. Returns the new row and
 * the pathnames of previously active rows so the caller can clean up the
 * orphaned blobs.
 */
export async function replaceAvatarForUser(input: {
  userId: string
  newRow: AvatarUploadInput
}): Promise<{ newRow: FileRow; previousPathnames: Array<string> }> {
  return db.transaction(async (tx) => {
    const previous = await tx
      .select({ id: file.id, pathname: file.pathname })
      .from(file)
      .where(and(eq(file.ownerId, input.userId), eq(file.access, 'public'), isNull(file.deletedAt)))

    const [newRow] = await tx
      .insert(file)
      .values({
        ownerId: input.userId,
        pathname: input.newRow.pathname,
        mime: input.newRow.mime,
        sizeBytes: input.newRow.sizeBytes,
        access: 'public',
      })
      .returning(fileSelection)

    if (previous.length > 0) {
      await tx
        .update(file)
        .set({ deletedAt: new Date() })
        .where(
          inArray(
            file.id,
            previous.map((p) => p.id),
          ),
        )
    }

    return { newRow, previousPathnames: previous.map((p) => p.pathname) }
  })
}

/**
 * Soft-delete a file row by id. The byte-handle level only — document soft-delete
 * touches document.deleted_at and leaves the byte alone; this is for direct byte
 * lifecycle ops (e.g. orphaned-avatar cleanup outside of replaceAvatarForUser).
 */
export async function softDelete(id: string): Promise<FileRow> {
  const target = await findById(id)
  if (!target) throw new FileDomainError('NOT_FOUND')
  if (target.deletedAt) return target

  const [row] = await db
    .update(file)
    .set({ deletedAt: new Date() })
    .where(eq(file.id, id))
    .returning(fileSelection)
  return row
}
