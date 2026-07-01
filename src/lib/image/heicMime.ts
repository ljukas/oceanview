// Single source of truth for "is this a HEIC/HEIF image?" across the codebase.
// iOS shoots HEIC; the upload path transcodes it (client-side first, then a
// server-side `heic_transcode` worker as the backstop). The MIME set and the
// extension test live here so the transcode worker, upload guards, and client
// pickers (tasks 7/9/10/12/15) never re-declare the literal and drift apart.

/** Canonical HEIC/HEIF MIME types. */
export const HEIC_MIME = new Set(['image/heic', 'image/heif'])

/**
 * True when `file` is a HEIC/HEIF image — by MIME type, or by a `.heic`/`.heif`
 * extension when the browser reports an empty/odd type (common for iOS files).
 */
export function isHeicFile(file: File): boolean {
  return HEIC_MIME.has(file.type.toLowerCase()) || /\.hei[cf]$/i.test(file.name)
}
