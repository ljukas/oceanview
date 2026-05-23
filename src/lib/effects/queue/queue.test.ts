import { expect, test } from 'vitest'
import { queue } from './queue'

test('publish resolves without throwing', async () => {
  await expect(queue.publish('blurhash', { fileId: 'abc' })).resolves.toBeUndefined()
})

test('repeated publishes do not throw', async () => {
  await queue.publish('blurhash', { fileId: 'one' })
  await queue.publish('blurhash', { fileId: 'two' })
  await expect(queue.publish('blurhash', { fileId: 'three' })).resolves.toBeUndefined()
})
