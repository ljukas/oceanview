import {
  BlobNotFoundError,
  copy as blobCopy,
  del,
  head,
  issueSignedToken,
  presignUrl,
  put,
} from '@vercel/blob'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'
import type { StorageEffects } from '../storage'

const TOKEN_TTL_MS = 5 * 60 * 1000

function tokenFor(access: 'public' | 'private'): string {
  const token =
    access === 'public'
      ? process.env.BLOB_PUBLIC_READ_WRITE_TOKEN
      : process.env.BLOB_PRIVATE_READ_WRITE_TOKEN
  if (!token) {
    throw new Error(
      `BLOB_${access.toUpperCase()}_READ_WRITE_TOKEN is not set; cannot use the vercelBlob adapter for ${access} storage.`,
    )
  }
  return token
}

function envPrefix(): string {
  switch (process.env.VERCEL_ENV) {
    case 'production':
      return 'prod/'
    case 'preview':
      return 'preview/'
    default:
      return 'dev/'
  }
}

const PREFIX = envPrefix()
const fullPath = (pathname: string) =>
  pathname.startsWith(PREFIX) ? pathname : `${PREFIX}${pathname}`

/**
 * Two-store Vercel Blob adapter. The `access` parameter routes to the right
 * read-write token (BLOB_PUBLIC_READ_WRITE_TOKEN vs BLOB_PRIVATE_READ_WRITE_TOKEN).
 * Pathnames are env-prefixed inside the adapter so callers think in logical
 * terms (`avatars/{userId}/{slug}`, `documents/{folder}/{name}`); the prefixed
 * form is what the browser SDK uses and what we store on metadata rows.
 */
export const vercelBlob: StorageEffects = {
  async mintUploadToken({ access, pathname, contentType, maxBytes }) {
    const prefixed = fullPath(pathname)
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: tokenFor(access),
      pathname: prefixed,
      allowedContentTypes: [contentType],
      maximumSizeInBytes: maxBytes,
      validUntil: Date.now() + TOKEN_TTL_MS,
      addRandomSuffix: false,
      allowOverwrite: false,
    })
    return { pathname: prefixed, upload: { kind: 'vercel-blob-client', clientToken } }
  },

  async head(access, pathname) {
    try {
      const result = await head(fullPath(pathname), { token: tokenFor(access) })
      return { url: result.url, contentType: result.contentType, size: result.size }
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null
      throw err
    }
  },

  async delete(access, pathname) {
    await del(fullPath(pathname), { token: tokenFor(access) })
  },

  async put(access, pathname, bytes, contentType) {
    // allowOverwrite so a re-run of the (idempotent) worker replaces the
    // existing derived asset rather than throwing on the same pathname.
    await put(fullPath(pathname), bytes, {
      access,
      token: tokenFor(access),
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    })
  },

  async copy(access, fromPathname, toPathname, contentType) {
    // `copy` does not carry the source content type over, so we re-pass the
    // file's stored mime. `addRandomSuffix: false` keeps the destination
    // pathname exactly as computed (its basename is the prod download name).
    await blobCopy(fullPath(fromPathname), fullPath(toPathname), {
      access,
      token: tokenFor(access),
      contentType,
      addRandomSuffix: false,
    })
  },

  async getReadUrl(access, pathname, ttlSeconds, _opts) {
    const prefixed = fullPath(pathname)
    if (access === 'public') {
      const result = await head(prefixed, { token: tokenFor('public') })
      return result.url
    }
    // `_opts.downloadFilename` is intentionally ignored here: the @vercel/blob
    // private presigned GET URL only honors `validUntil` (PresignGetUrlOptions
    // rejects per-read Content-Disposition at the type level). The browser
    // still saves the file under the immutable storage pathname, which keeps
    // the correct extension — only the renamed base name isn't reflected in
    // prod downloads. The S3 (dev) adapter honors it fully via
    // ResponseContentDisposition. Revisit if the SDK adds read-time disposition.
    const validUntil = Date.now() + ttlSeconds * 1000
    const signedToken = await issueSignedToken({
      token: tokenFor('private'),
      pathname: prefixed,
      operations: ['get'],
      validUntil,
    })
    const { presignedUrl } = await presignUrl(signedToken, {
      operation: 'get',
      pathname: prefixed,
      access: 'private',
      validUntil,
    })
    return presignedUrl
  },
}
