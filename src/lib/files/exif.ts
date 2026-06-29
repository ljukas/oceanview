import exifr from 'exifr'

// Read GPS coordinates from an image File's EXIF, in the browser, BEFORE any
// HEIC->JPEG transcode (the transcode strips metadata — ADR-0012 §4). exifr.gps()
// is the fast path (latitude/longitude tags only) and accepts a File/Blob directly.
// Returns null on: no GPS block, corrupt/unsupported EXIF, or non-finite values —
// the caller then falls back to manual placement.
export async function readGpsFromFile(file: File): Promise<{ lat: number; lng: number } | null> {
  try {
    const gps = await exifr.gps(file)
    if (
      gps &&
      Number.isFinite(gps.latitude) &&
      Number.isFinite(gps.longitude) &&
      Math.abs(gps.latitude) <= 90 &&
      Math.abs(gps.longitude) <= 180
    ) {
      return { lat: gps.latitude, lng: gps.longitude }
    }
    return null
  } catch {
    return null
  }
}
