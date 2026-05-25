import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '~/lib/db'
import { file, user } from '~/lib/db/schema'
import { FileDomainError } from './errors'

export type FileAccess = 'public' | 'private'

export type FileRow = {
  id: string
  ownerId: string
  pathname: string
  name: string
  mime: string
  sizeBytes: number
  folder: string | null
  access: FileAccess
  blurhash: string | null
  uploadedAt: Date
  deletedAt: Date | null
}

export type DocumentRow = FileRow & { ownerName: string }

export type ConfirmUploadInput = {
  ownerId: string
  pathname: string
  name: string
  mime: string
  sizeBytes: number
  folder?: string | null
  access: FileAccess
}

const fileSelection = {
  id: file.id,
  ownerId: file.ownerId,
  pathname: file.pathname,
  name: file.name,
  mime: file.mime,
  sizeBytes: file.sizeBytes,
  folder: file.folder,
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

export async function confirmUpload(input: ConfirmUploadInput): Promise<FileRow> {
  const [row] = await db
    .insert(file)
    .values({
      ownerId: input.ownerId,
      pathname: input.pathname,
      name: input.name,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      folder: input.folder ?? null,
      access: input.access,
    })
    .returning(fileSelection)
  return row
}

export async function setBlurhash(input: { fileId: string; blurhash: string }): Promise<void> {
  await db
    .update(file)
    .set({ blurhash: input.blurhash })
    .where(and(eq(file.id, input.fileId), isNull(file.deletedAt)))
}

export async function listAllDocuments(): Promise<Array<DocumentRow>> {
  const rows = await db
    .select({ ...fileSelection, ownerName: user.name })
    .from(file)
    .innerJoin(user, eq(file.ownerId, user.id))
    .where(and(eq(file.access, 'private'), isNull(file.deletedAt)))
    .orderBy(desc(file.uploadedAt))
  return rows
}

/**
 * Insert a new public file row for the user's avatar and soft-delete any
 * previously active public rows owned by that user. Returns the new row and
 * the pathnames of previously active rows so the caller can clean up the
 * orphaned blobs.
 */
export async function replaceAvatarForUser(input: {
  userId: string
  newRow: Omit<ConfirmUploadInput, 'ownerId' | 'access'>
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
        name: input.newRow.name,
        mime: input.newRow.mime,
        sizeBytes: input.newRow.sizeBytes,
        folder: input.newRow.folder ?? null,
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

export async function softDelete(input: {
  id: string
  actingUserId: string
  actingUserRole: string | null
}): Promise<FileRow> {
  const target = await findById(input.id)
  if (!target) throw new FileDomainError('NOT_FOUND')
  if (target.deletedAt) return target

  if (target.access === 'public') {
    throw new FileDomainError('CANNOT_DELETE_AVATAR_VIA_DOCUMENT_DELETE')
  }

  if (input.actingUserRole !== 'admin' && target.ownerId !== input.actingUserId) {
    throw new FileDomainError('CANNOT_DELETE_OTHERS_FILE')
  }

  const [row] = await db
    .update(file)
    .set({ deletedAt: new Date() })
    .where(eq(file.id, input.id))
    .returning(fileSelection)
  return row
}
