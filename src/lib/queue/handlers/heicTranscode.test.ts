import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, expect, test, vi } from 'vitest'

// Unit-test of the handler's orchestration: every collaborator is mocked so the
// branches (recommendation/document/avatar replace + decode failure + idempotent
// no-op) are exercised without real storage, queue, realtime, or wasm decode.
// Mirrors the codebase's `vi.mock(...)` adapter-test idiom (see s3.test.ts).

// `vi.mock` factories are hoisted above the file, so the mock objects they
// reference must be declared in `vi.hoisted` (also hoisted) rather than as
// ordinary top-level consts (which would be in the TDZ when the factory runs).
const {
  storage,
  queue,
  realtime,
  fileService,
  documentService,
  userService,
  recommendationService,
  transcodeHeicToJpeg,
  generateImageThumbnail,
} = vi.hoisted(() => ({
  storage: { getReadUrl: vi.fn(), put: vi.fn(), delete: vi.fn(), head: vi.fn() },
  queue: { publish: vi.fn() },
  realtime: { publish: vi.fn() },
  fileService: {
    findActiveById: vi.fn(),
    replaceTranscoded: vi.fn(),
    setTranscodeFailed: vi.fn(),
  },
  documentService: { setThumbnailPathname: vi.fn() },
  userService: { setImage: vi.fn() },
  recommendationService: { findRecommendationIdByFileId: vi.fn() },
  transcodeHeicToJpeg: vi.fn(),
  generateImageThumbnail: vi.fn(),
}))

vi.mock('~/lib/effects', () => ({ storage, queue, realtime }))
vi.mock('~/lib/services/file', () => fileService)
vi.mock('~/lib/services/document', () => documentService)
vi.mock('~/lib/services/user', () => userService)
vi.mock('~/lib/services/recommendation', () => recommendationService)
vi.mock('~/lib/image/heicTranscode', () => ({ transcodeHeicToJpeg }))
vi.mock('~/lib/image/thumbnail', () => ({ generateImageThumbnail }))

import { handleHeicTranscodeMessage } from './heicTranscode'

const META = { messageId: 'm1', deliveryCount: 1 }
const heic = readFileSync(
  fileURLToPath(new URL('../../../../test/fixtures/geotagged.heic', import.meta.url)),
)
const JPEG = Buffer.from('jpeg-bytes')
const WEBP = Buffer.from('webp-bytes')

function fileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    ownerId: 'u1',
    pathname: 'recommendations/u1/x.heic',
    mime: 'image/heic',
    sizeBytes: heic.byteLength,
    access: 'public',
    blurhash: null,
    transcodeFailedAt: null,
    uploadedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  storage.getReadUrl.mockResolvedValue('https://signed.example/x.heic')
  // `.catch()`ed in the handler — must return a promise, not undefined.
  storage.delete.mockResolvedValue(undefined)
  queue.publish.mockResolvedValue(undefined)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(heic, { status: 200 })),
  )
  transcodeHeicToJpeg.mockResolvedValue(JPEG)
  generateImageThumbnail.mockResolvedValue(WEBP)
})

test('recommendation: replaces file with JPEG, deletes original, enqueues blurhash, publishes', async () => {
  fileService.findActiveById.mockResolvedValue(fileRow())
  recommendationService.findRecommendationIdByFileId.mockResolvedValue('rec1')

  await handleHeicTranscodeMessage({ fileId: 'f1', kind: 'recommendation' }, META)

  expect(storage.put).toHaveBeenCalledWith('public', 'recommendations/u1/x.jpg', JPEG, 'image/jpeg')
  expect(fileService.replaceTranscoded).toHaveBeenCalledWith({
    fileId: 'f1',
    pathname: 'recommendations/u1/x.jpg',
    mime: 'image/jpeg',
    sizeBytes: JPEG.byteLength,
  })
  expect(storage.delete).toHaveBeenCalledWith('public', 'recommendations/u1/x.heic')
  expect(queue.publish).toHaveBeenCalledWith('blurhash', { fileId: 'f1', kind: 'recommendation' })
  expect(recommendationService.findRecommendationIdByFileId).toHaveBeenCalledWith('f1')
  expect(realtime.publish).toHaveBeenCalledWith({ kind: 'recommendation.changed', ids: ['rec1'] })
})

test('recommendation: skips publish when the photo was removed mid-flight', async () => {
  fileService.findActiveById.mockResolvedValue(fileRow())
  recommendationService.findRecommendationIdByFileId.mockResolvedValue(null)

  await handleHeicTranscodeMessage({ fileId: 'f1', kind: 'recommendation' }, META)

  expect(fileService.replaceTranscoded).toHaveBeenCalled()
  expect(realtime.publish).not.toHaveBeenCalled()
})

test('document: keeps original, writes WebP thumbnail, sets thumbnailPathname', async () => {
  fileService.findActiveById.mockResolvedValue(
    fileRow({ access: 'private', pathname: 'documents/photo.heic' }),
  )

  await handleHeicTranscodeMessage({ fileId: 'f1', kind: 'document', documentId: 'd1' }, META)

  expect(generateImageThumbnail).toHaveBeenCalledWith(JPEG)
  expect(storage.put).toHaveBeenCalledWith('public', 'thumbnails/d1.webp', WEBP, 'image/webp')
  expect(documentService.setThumbnailPathname).toHaveBeenCalledWith({
    documentId: 'd1',
    pathname: 'thumbnails/d1.webp',
  })
  // The original byte and file row are untouched (replace path skipped).
  expect(fileService.replaceTranscoded).not.toHaveBeenCalled()
  expect(storage.delete).not.toHaveBeenCalled()
  expect(realtime.publish).toHaveBeenCalledWith({ kind: 'document.changed', ids: ['d1'] })
})

test('document: writes the sentinel and does not store when thumbnail render fails', async () => {
  fileService.findActiveById.mockResolvedValue(
    fileRow({ access: 'private', pathname: 'documents/photo.heic' }),
  )
  generateImageThumbnail.mockRejectedValue(new Error('sharp boom'))

  await handleHeicTranscodeMessage({ fileId: 'f1', kind: 'document', documentId: 'd1' }, META)

  expect(documentService.setThumbnailPathname).toHaveBeenCalledWith({
    documentId: 'd1',
    pathname: '',
  })
  expect(storage.put).not.toHaveBeenCalled()
})

test('avatar: replaces file, repoints user.image to new url, enqueues blurhash', async () => {
  fileService.findActiveById.mockResolvedValue(fileRow({ pathname: 'avatars/u1/me.heic' }))
  storage.head.mockResolvedValue({
    url: 'https://blob.example/avatars/u1/me.jpg',
    contentType: 'image/jpeg',
    size: JPEG.byteLength,
  })

  await handleHeicTranscodeMessage({ fileId: 'f1', kind: 'avatar', userId: 'u1' }, META)

  expect(storage.put).toHaveBeenCalledWith('public', 'avatars/u1/me.jpg', JPEG, 'image/jpeg')
  expect(fileService.replaceTranscoded).toHaveBeenCalledWith({
    fileId: 'f1',
    pathname: 'avatars/u1/me.jpg',
    mime: 'image/jpeg',
    sizeBytes: JPEG.byteLength,
  })
  expect(storage.delete).toHaveBeenCalledWith('public', 'avatars/u1/me.heic')
  expect(queue.publish).toHaveBeenCalledWith('blurhash', {
    fileId: 'f1',
    kind: 'avatar',
    userId: 'u1',
  })
  expect(storage.head).toHaveBeenCalledWith('public', 'avatars/u1/me.jpg')
  expect(userService.setImage).toHaveBeenCalledWith('u1', 'https://blob.example/avatars/u1/me.jpg')
  expect(realtime.publish).toHaveBeenCalledWith({ kind: 'user.changed', ids: ['u1'] })
})

test('permanent decode failure: stamps transcodeFailedAt, no throw', async () => {
  fileService.findActiveById.mockResolvedValue(fileRow())
  recommendationService.findRecommendationIdByFileId.mockResolvedValue('rec1')
  transcodeHeicToJpeg.mockRejectedValue(new Error('libheif boom'))

  await expect(
    handleHeicTranscodeMessage({ fileId: 'f1', kind: 'recommendation' }, META),
  ).resolves.toBeUndefined()

  expect(fileService.setTranscodeFailed).toHaveBeenCalledWith('f1')
  expect(storage.put).not.toHaveBeenCalled()
  expect(fileService.replaceTranscoded).not.toHaveBeenCalled()
  // Still notifies subscribers so a failed placeholder can render.
  expect(realtime.publish).toHaveBeenCalledWith({ kind: 'recommendation.changed', ids: ['rec1'] })
})

test('already JPEG (idempotent re-delivery): no-op', async () => {
  fileService.findActiveById.mockResolvedValue(fileRow({ mime: 'image/jpeg' }))

  await handleHeicTranscodeMessage({ fileId: 'f1', kind: 'recommendation' }, META)

  expect(transcodeHeicToJpeg).not.toHaveBeenCalled()
  expect(storage.getReadUrl).not.toHaveBeenCalled()
  expect(storage.put).not.toHaveBeenCalled()
  expect(fileService.replaceTranscoded).not.toHaveBeenCalled()
})

test('file gone: no-op', async () => {
  fileService.findActiveById.mockResolvedValue(null)

  await handleHeicTranscodeMessage({ fileId: 'f1', kind: 'recommendation' }, META)

  expect(storage.getReadUrl).not.toHaveBeenCalled()
  expect(transcodeHeicToJpeg).not.toHaveBeenCalled()
})

test('previously failed: no-op', async () => {
  fileService.findActiveById.mockResolvedValue(fileRow({ transcodeFailedAt: new Date() }))

  await handleHeicTranscodeMessage({ fileId: 'f1', kind: 'recommendation' }, META)

  expect(transcodeHeicToJpeg).not.toHaveBeenCalled()
  expect(storage.put).not.toHaveBeenCalled()
})
