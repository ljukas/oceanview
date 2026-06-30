import ExifReader from 'exifreader'

// Read GPS coordinates from an image File's EXIF, in the browser, BEFORE any
// HEIC->JPEG transcode (the transcode strips metadata — ADR-0012 §4). We use
// `exifreader` rather than `exifr`: exifr rejects iPhone HEICs whose `ftyp` box
// exceeds 50 bytes (i.e. a major brand + several compatible brands — every modern
// iPhone photo), throwing "Unknown file format", so HEIC GPS never reached the map
// (see ADR-0012 2026-06-29 amendment). `{ expanded: true }` yields
// `gps.Latitude`/`gps.Longitude` as sign-applied decimals (N/E positive, S/W
// negative). Returns null on: no GPS block, unparseable metadata, or
// non-finite/out-of-range values — the caller then falls back to manual placement.
export async function readGpsFromFile(file: File): Promise<{ lat: number; lng: number } | null> {
  try {
    const tags = ExifReader.load(await file.arrayBuffer(), { expanded: true })
    const lat = tags.gps?.Latitude
    const lng = tags.gps?.Longitude
    if (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      return { lat, lng }
    }
    return null
  } catch {
    return null
  }
}
