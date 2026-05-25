import './loadEnv'

import { Worker } from 'bullmq'
import type { QueuePayloadMap } from '~/lib/effects/queue/queue'
import { logger } from '~/lib/logger/server'
import { handleBlurhashMessage } from '~/lib/queue/handlers/blurhash'

/**
 * Local-dev consumer for the `blurhash` topic. Run via
 * `pnpm dev:worker`. Connects to the Redis container declared in
 * `compose.yaml` (started by `pnpm queue:up`) and dispatches each job
 * through `handleBlurhashMessage` — the same handler the Nitro
 * `vercel:queue` plugin uses in production. BullMQ owns polling, ack,
 * retry/backoff (configured on the producer in `bullmqQueue.ts`), and
 * graceful shutdown.
 */
const log = logger.child({ component: 'devBlurhashWorker' })
const url = process.env.REDIS_URL ?? 'redis://localhost:6379'

const worker = new Worker<QueuePayloadMap['blurhash']>(
  'blurhash',
  async (job) => {
    await handleBlurhashMessage(job.data, {
      messageId: job.id ?? 'local-unknown',
      deliveryCount: job.attemptsMade + 1,
    })
  },
  { connection: { url } },
)

worker.on('completed', (job) => log.info('job completed', { jobId: job.id }))
worker.on('failed', (job, err) =>
  log.error('job failed', { jobId: job?.id, attempts: job?.attemptsMade, err }),
)
worker.on('error', (err) => log.error('worker error', { err }))

log.info('worker ready, listening on queue=blurhash', { url })

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    log.info('worker shutting down', { signal: sig })
    await worker.close()
    process.exit(0)
  })
}
