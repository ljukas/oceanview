import { expect, test } from 'vitest'
import { HEIC_MIME, isHeicFile } from './heicMime'

test('HEIC_MIME is the canonical HEIC/HEIF mime set', () => {
  expect(HEIC_MIME.has('image/heic')).toBe(true)
  expect(HEIC_MIME.has('image/heif')).toBe(true)
  expect(HEIC_MIME.has('image/jpeg')).toBe(false)
})

test('isHeicFile: true for a HEIC mime type', () => {
  expect(isHeicFile(new File([], 'photo.bin', { type: 'image/heic' }))).toBe(true)
})

test('isHeicFile: true for a .heif extension (no/odd mime type)', () => {
  expect(isHeicFile(new File([], 'IMG_0001.HEIF', { type: '' }))).toBe(true)
})

test('isHeicFile: false for a JPEG', () => {
  expect(isHeicFile(new File([], 'photo.jpg', { type: 'image/jpeg' }))).toBe(false)
})
