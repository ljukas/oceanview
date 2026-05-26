/**
 * Storage interface backed by one of three adapters:
 *   - `vercelBlob` — Vercel Blob in production.
 *   - `s3` — a local S3-compatible container (RustFS in `compose.yaml`) for
 *     offline dev. Selected when `S3_ENDPOINT` is set.
 *   - `devLog` — no-op stub for tests + offline dev without docker.
 *
 * Avatars live in the public store/bucket; documents in the private one.
 * Pathnames flow through this interface as logical paths
 * (`avatars/{userId}/{slug}`, `documents/{folder}/{name}`); each adapter
 * decides whether to env-prefix (Vercel Blob does; S3 doesn't — the dev
 * bucket is the env boundary).
 *
 * `mintUploadToken` returns a discriminated `upload` payload so the browser
 * can pick the right transport: Vercel Blob uses the SDK's client-token
 * flow (with progress events), S3 uses a presigned PUT URL the browser
 * PUTs to directly. The browser dispatcher lives in `clientUpload.ts`.
 */
export interface HeadResult {
  url: string
  contentType: string
  size: number
}

export type MintUploadResult = {
  pathname: string
  upload:
    | { kind: 'vercel-blob-client'; clientToken: string }
    | { kind: 'presigned-put'; url: string; headers?: Record<string, string> }
}

export interface StorageEffects {
  /**
   * Mint the credential the browser needs to upload bytes directly.
   * `pathname` in the input is the logical path; the adapter may prefix it
   * and returns the final pathname the browser MUST round-trip back when
   * confirming the upload (server-side validation pins identity to it).
   */
  mintUploadToken(input: {
    access: 'public' | 'private'
    pathname: string
    contentType: string
    maxBytes: number
  }): Promise<MintUploadResult>

  /** Existence + metadata check for a pathname. Returns null when the blob does not exist. */
  head(access: 'public' | 'private', pathname: string): Promise<HeadResult | null>

  delete(access: 'public' | 'private', pathname: string): Promise<void>

  /**
   * Download URL for a stored object. For `private`, returns a signed,
   * time-limited URL. For `public`, returns either the canonical public URL
   * (Vercel Blob) or a longer-lived presigned URL (S3 dev) — `ttlSeconds`
   * may be ignored for public on adapters whose public URLs don't expire.
   */
  getReadUrl(access: 'public' | 'private', pathname: string, ttlSeconds: number): Promise<string>
}

let cached: Promise<StorageEffects> | null = null

async function getAdapter(): Promise<StorageEffects> {
  if (cached) return cached
  cached = (async () => {
    if (process.env.STORAGE_ADAPTER === 'devLog') {
      return (await import('./adapters/devLog')).devLog
    }
    // Local dev S3-compatible storage (RustFS in `compose.yaml`). Takes
    // precedence over BLOB_* so `vercel env pull` doesn't accidentally route
    // dev uploads at the real Vercel Blob CDN.
    if (process.env.S3_ENDPOINT) {
      return (await import('./adapters/s3')).s3
    }
    if (!process.env.BLOB_PUBLIC_READ_WRITE_TOKEN || !process.env.BLOB_PRIVATE_READ_WRITE_TOKEN) {
      return (await import('./adapters/devLog')).devLog
    }
    return (await import('./adapters/vercelBlob')).vercelBlob
  })()
  return cached
}

export const storage: StorageEffects = {
  async mintUploadToken(input) {
    const adapter = await getAdapter()
    return adapter.mintUploadToken(input)
  },
  async head(access, pathname) {
    const adapter = await getAdapter()
    return adapter.head(access, pathname)
  },
  async delete(access, pathname) {
    const adapter = await getAdapter()
    return adapter.delete(access, pathname)
  },
  async getReadUrl(access, pathname, ttlSeconds) {
    const adapter = await getAdapter()
    return adapter.getReadUrl(access, pathname, ttlSeconds)
  },
}
