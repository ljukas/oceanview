// HEIC/HEIF transcode helpers, shared by avatar + recommendation photo uploads.
// iOS shoots HEIC; the upload mint allow-list (UPLOAD_IMAGE_MIME) accepts only
// jpeg/png/webp/avif, so HEIC must be transcoded to JPEG in the browser first.
// `heic-to` is lazy-imported so it never enters the initial bundle.
export function isHeicCandidate(file: File): boolean {
  const t = file.type.toLowerCase()
  if (t === 'image/heic' || t === 'image/heif') return true
  const n = file.name.toLowerCase()
  return n.endsWith('.heic') || n.endsWith('.heif')
}

export async function transcodeHeicToJpeg(file: File): Promise<File> {
  const { heicTo } = await import('heic-to')
  const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.85 })
  const renamed = file.name.replace(/\.(heic|heif)$/i, '.jpg')
  return new File([blob], renamed, { type: 'image/jpeg' })
}
