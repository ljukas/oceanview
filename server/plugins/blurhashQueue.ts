import { definePlugin } from 'nitro'
import type { QueuePayloadMap } from '~/lib/effects/queue/queue'
import { handleBlurhashMessage } from '~/lib/queue/handlers/blurhash'

/**
 * Vercel Queues consumer for the `blurhash` topic. Wired by Nitro's vercel
 * preset via `vercel.queues.triggers` in vite.config.ts. The real work
 * lives in `~/lib/queue/handlers/blurhash` so the local BullMQ worker
 * (`scripts/devBlurhashWorker.ts`) can call the exact same function.
 */
export default definePlugin((nitro) => {
  nitro.hooks.hook('vercel:queue', async ({ message, metadata }) => {
    if (metadata.topicName !== 'blurhash') return
    await handleBlurhashMessage(message as QueuePayloadMap['blurhash'], {
      messageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
    })
  })
})
