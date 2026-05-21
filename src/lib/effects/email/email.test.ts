import { expect, test } from 'vitest'
import { email } from './email'

test('sendMagicLink resolves without throwing', async () => {
  await expect(
    email.sendMagicLink({ to: 'anna@test.oceanview.local', url: 'https://example.test/m/abc' }),
  ).resolves.toBeUndefined()
})

test('sendMagicLink handles repeated calls without side-effects on the adapter', async () => {
  await email.sendMagicLink({ to: 'bo@test.oceanview.local', url: 'https://example.test/m/xyz' })
  await email.sendMagicLink({ to: 'cara@test.oceanview.local', url: 'https://example.test/m/zzz' })
  // The devLog adapter forwards to the structured logger. Format assertions
  // live in src/lib/logger/server.test.ts; this test only validates the
  // interface contract (resolves to undefined, no throws).
  await expect(
    email.sendMagicLink({ to: 'dan@test.oceanview.local', url: 'https://example.test/m/qqq' }),
  ).resolves.toBeUndefined()
})
