import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { logger } from '~/lib/logger/server'

const MAX_BODY_BYTES = 8 * 1024

const bodySchema = z.object({
  level: z.enum(['warn', 'error']),
  msg: z.string().min(1).max(500),
  fields: z.record(z.string(), z.unknown()).optional(),
})

export const Route = createFileRoute('/api/log')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const text = await request.text()
        if (text.length > MAX_BODY_BYTES) {
          return new Response(null, { status: 413 })
        }
        let raw: unknown
        try {
          raw = JSON.parse(text)
        } catch {
          return new Response(null, { status: 400 })
        }
        const parsed = bodySchema.safeParse(raw)
        if (!parsed.success) {
          return new Response(null, { status: 400 })
        }
        const { level, msg, fields } = parsed.data
        logger[level](msg, { ...fields, source: 'browser' })
        return new Response(null, { status: 204 })
      },
    },
  },
})
