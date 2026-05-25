import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { admin, magicLink } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { isAllowlistedAdmin, normalizeEmail } from './adminAllowlist'
import { db } from './db'
import * as schema from './db/schema'
import { email as emailEffect } from './effects'
import { logger } from './logger/server'
import * as userService from './services/user'

// On Vercel previews each deployment has its own hostname (e.g.
// `oceanview-<hash>-...vercel.app`), so BETTER_AUTH_URL (pinned to prod)
// would fail Better Auth's origin check AND send magic links pointing
// back to prod instead of the preview the user is testing.
const resolveBaseURL = () => {
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return process.env.BETTER_AUTH_URL
}

// VERCEL_URL is the unique deployment hash hostname; VERCEL_BRANCH_URL
// is the stable branch alias. Trust the alias too so either entry point
// works on a preview.
const resolveTrustedOrigins = () => {
  const origins: string[] = []
  if (process.env.VERCEL_BRANCH_URL) {
    origins.push(`https://${process.env.VERCEL_BRANCH_URL}`)
  }
  return origins
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  baseURL: resolveBaseURL(),
  trustedOrigins: resolveTrustedOrigins(),
  secret: process.env.BETTER_AUTH_SECRET,
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  user: {
    additionalFields: {
      phone: {
        type: 'string',
        required: false,
      },
      deletedAt: {
        type: 'date',
        required: false,
        input: false,
      },
      // Blurhash of the user's avatar — written by the queue consumer
      // after avatar upload (see server/plugins/blurhashQueue.ts). The
      // client only reads it (input: false) to paint a placeholder
      // gradient under <AvatarImage>.
      imageBlurhash: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const normalized = normalizeEmail(email)
        const existingId = await userService.findIdByEmail(normalized)
        if (!existingId && !isAllowlistedAdmin(normalized)) {
          logger.info('magic-link denied (unknown email)', { email: normalized })
          throw new APIError('BAD_REQUEST', {
            message:
              'Inget konto finns för denna e-postadress. Kontakta en administratör för att läggas till.',
          })
        }
        await emailEffect.sendMagicLink({ to: email, url })
        logger.info('magic-link sent', { email: normalized, userId: existingId ?? null })
      },
    }),
    admin(),
    passkey({
      rpID: new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').hostname,
      rpName: 'Oceanview',
      origin: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    }),
    tanstackStartCookies(),
  ],
  advanced: {
    database: {
      generateId: 'uuid',
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (isAllowlistedAdmin(user.email)) {
            return { data: { ...user, role: 'admin' } }
          }
        },
        after: async (user) => {
          logger.info('auth user created', { userId: user.id, role: user.role })
        },
      },
      update: {
        after: async (user) => {
          logger.info('auth user updated', { userId: user.id })
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          logger.info('auth session created', { userId: session.userId })
        },
      },
    },
  },
})
