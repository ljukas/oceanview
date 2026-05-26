import { expect, test } from 'vitest'
import { storage } from './storage'

test('mintUploadToken returns a pathname and a typed upload payload', async () => {
  const result = await storage.mintUploadToken({
    access: 'public',
    pathname: 'avatars/user-1/abc',
    contentType: 'image/jpeg',
    maxBytes: 1_000_000,
  })
  expect(result.pathname).toBe('avatars/user-1/abc')
  expect(result.upload.kind).toBeTypeOf('string')
  if (result.upload.kind === 'vercel-blob-client') {
    expect(result.upload.clientToken).toBeTypeOf('string')
  } else {
    expect(result.upload.url).toBeTypeOf('string')
  }
})

test('mintUploadToken routes private the same way', async () => {
  const result = await storage.mintUploadToken({
    access: 'private',
    pathname: 'documents/manual.pdf',
    contentType: 'application/pdf',
    maxBytes: 25_000_000,
  })
  expect(result.pathname).toBe('documents/manual.pdf')
  expect(result.upload.kind).toBeTypeOf('string')
})

test('head returns a stub HeadResult for any pathname', async () => {
  const result = await storage.head('public', 'avatars/anything')
  expect(result).not.toBeNull()
  expect(result?.url).toContain('avatars/anything')
  expect(typeof result?.contentType).toBe('string')
  expect(typeof result?.size).toBe('number')
})

test('delete resolves without throwing', async () => {
  await expect(storage.delete('public', 'avatars/test')).resolves.toBeUndefined()
  await expect(storage.delete('private', 'documents/test.pdf')).resolves.toBeUndefined()
})

test('getReadUrl returns a string URL for private', async () => {
  const url = await storage.getReadUrl('private', 'documents/test.pdf', 60)
  expect(typeof url).toBe('string')
  expect(url.length).toBeGreaterThan(0)
})

test('getReadUrl returns a string URL for public', async () => {
  const url = await storage.getReadUrl('public', 'avatars/user-1/abc.png', 60)
  expect(typeof url).toBe('string')
  expect(url.length).toBeGreaterThan(0)
})
