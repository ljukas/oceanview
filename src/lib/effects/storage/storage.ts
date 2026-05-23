import { devLog } from './adapters/devLog'
import { vercelBlob } from './adapters/vercelBlob'

/**
 * Storage interface backed by either Vercel Blob or the `devLog` stub
 * (tests + offline dev). Avatars live in the public store; documents in the
 * private store. The selector picks vercelBlob when both read-write tokens
 * are set, devLog otherwise.
 *
 * The browser uploads bytes directly to Blob via `put(pathname, file, { token })`
 * from `@vercel/blob/client`; the token comes from `mintUploadToken` and the
 * post-upload metadata write is gated by `head` to confirm the blob exists.
 * No webhook callback is involved.
 */
export interface HeadResult {
  url: string
  contentType: string
  size: number
}

export interface StorageEffects {
  /**
   * Mint a short-lived client token the browser uses with `put(pathname, file, { token })`.
   * `pathname` in the input is the logical path (e.g. `avatars/{userId}/{slug}`); the adapter
   * prefixes it with the env namespace (`dev/`, `preview/`, `prod/`) and returns the final
   * prefixed pathname that the browser MUST pass back into `put` (the token is scoped to it).
   */
  mintUploadToken(input: {
    access: 'public' | 'private'
    pathname: string
    contentType: string
    maxBytes: number
  }): Promise<{ clientToken: string; pathname: string }>

  /** Existence + metadata check for a pathname. Returns null when the blob does not exist. */
  head(access: 'public' | 'private', pathname: string): Promise<HeadResult | null>

  delete(access: 'public' | 'private', pathname: string): Promise<void>

  /** Signed time-limited download URL for a private-store object. */
  getReadUrl(pathname: string, ttlSeconds: number): Promise<string>
}

function pickAdapter(): StorageEffects {
  if (process.env.STORAGE_ADAPTER === 'devLog') return devLog
  if (!process.env.BLOB_PUBLIC_READ_WRITE_TOKEN || !process.env.BLOB_PRIVATE_READ_WRITE_TOKEN) {
    return devLog
  }
  return vercelBlob
}

export const storage: StorageEffects = pickAdapter()
