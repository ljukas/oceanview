import { expect, test } from 'vitest'
import { vercelBlob } from './vercelBlob'

// VERCEL_ENV is unset in tests → the current env prefix is 'dev/', so a `prod/`
// pathname is foreign-origin. The store is shared across environments, so the
// adapter must refuse to mutate a foreign byte (it belongs to prod). These
// resolve without a BLOB token because the guard short-circuits before any
// token lookup or network call — proving no prod object is ever touched.

test('delete no-ops on a foreign-origin pathname (no token, no network)', async () => {
  await expect(vercelBlob.delete('private', 'prod/documents/x.pdf')).resolves.toBeUndefined()
  await expect(vercelBlob.delete('public', 'prod/avatars/u/a.png')).resolves.toBeUndefined()
})

test('copy no-ops when either endpoint is foreign-origin', async () => {
  await expect(
    vercelBlob.copy(
      'private',
      'prod/documents/old.pdf',
      'prod/documents/new.pdf',
      'application/pdf',
    ),
  ).resolves.toBeUndefined()
})
