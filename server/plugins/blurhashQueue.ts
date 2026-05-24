import { eq } from 'drizzle-orm'
import { definePlugin } from 'nitro'
import { db } from '~/lib/db'
import { user } from '~/lib/db/schema'
import { storage } from '~/lib/effects'
import type { QueuePayloadMap } from '~/lib/effects/queue/queue'
import { generateBlurhash, SHARP_DECODABLE_MIME_SET } from '~/lib/image/blurhash'
import { logger } from '~/lib/logger/server'
import * as fileService from '~/lib/services/file'

const READ_URL_TTL_SECONDS = 60

/**
 * Vercel Queues consumer for the `blurhash` topic. Wired by Nitro's
 * vercel preset via `vercel.queues.triggers` in vite.config.ts.
 *
 * Producers carry the `kind` of the file in the message so downstream
 * side-effects (mirroring onto `user.image_blurhash`, etc.) are explicit
 * at publish time rather than inferred from the file row. We still
 * re-fetch the row to mint a fresh signed URL — so an expired URL is
 * never trusted and a soft-delete that races the job is a clean no-op.
 *
 * Sharp + blurhash are pulled in via a dynamic import of
 * `~/lib/image/blurhash` so the heavy native module only loads after the
 * first message hits this function instance — main app routes never pay
 * the cold-start cost.
 */
export default definePlugin((nitro) => {
  nitro.hooks.hook('vercel:queue', async ({ message, metadata }) => {
    if (metadata.topicName !== 'blurhash') return

    const msg = message as QueuePayloadMap['blurhash']
    const { fileId } = msg
    const log = logger.child({
      topic: 'blurhash',
      kind: msg.kind,
      fileId,
      messageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
    })

    const row = await fileService.findActiveById(fileId)
    if (!row) {
      log.warn('blurhash: file gone, skipping')
      return
    }
    if (row.blurhash) {
      log.info('blurhash: already set, skipping')
      return
    }
    if (!SHARP_DECODABLE_MIME_SET.has(row.mime)) {
      // Skip without throwing so the queue acks the message instead of
      // retrying. Producers gate on the same set; landing here means a
      // mime arrived that the prebuilt sharp binary can't decode (e.g.
      // raw HEIC if `heic-to` client conversion was bypassed).
      log.info('blurhash: unsupported mime, skipping', { mime: row.mime })
      return
    }

    const url = await storage.getReadUrl(row.access, row.pathname, READ_URL_TTL_SECONDS)
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`blurhash: download failed ${res.status}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())

    // `generateBlurhash` dynamic-imports `sharp` + `blurhash` itself, so
    // the heavy modules only load on the first message — importing the
    // wrapper statically here doesn't drag them into the bundle.
    const hash = await generateBlurhash(buf)

    await fileService.setBlurhash({ fileId, blurhash: hash })
    log.info('blurhash: stored', { length: hash.length })

    if (msg.kind === 'avatar') {
      const updated = await db
        .update(user)
        .set({ imageBlurhash: hash })
        .where(eq(user.id, msg.userId))
        .returning({ id: user.id })
      if (updated.length > 0) {
        log.info('blurhash: denormalized to user.imageBlurhash', { userId: msg.userId })
      } else {
        log.warn('blurhash: target user gone, skipped denormalization', { userId: msg.userId })
      }
    }
  })
})
