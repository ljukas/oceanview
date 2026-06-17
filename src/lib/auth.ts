import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { passkey } from '@better-auth/passkey'
import { waitUntil } from '@vercel/functions'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { admin, magicLink } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { m } from '~/paraglide/messages'
import { getLocale } from '~/paraglide/runtime'
import { isAllowlistedAdmin, normalizeEmail } from './adminAllowlist'
import { rememberUser } from './browserSession'
import { db } from './db'
import * as schema from './db/schema'
import { email as emailEffect } from './effects'
import { logger } from './logger/server'
import * as userService from './services/user'

// On Vercel previews each deployment has its own hostname, so BETTER_AUTH_URL
// (pinned to prod) would fail Better Auth's origin check AND send magic links
// back to prod instead of the preview being tested. Prefer VERCEL_BRANCH_URL
// (the stable branch alias) so magic links + sessions survive re-pushes to the
// same PR; fall back to VERCEL_URL (the per-deployment hash) if the alias is
// somehow absent.
const resolveBaseURL = () => {
  if (process.env.VERCEL_ENV === 'preview') {
    if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  }
  return process.env.BETTER_AUTH_URL
}

// VERCEL_BRANCH_URL is the stable branch alias; VERCEL_URL is the unique
// deployment hash hostname. Trust both so a preview opened via either entry
// point passes the origin check (baseURL is auto-trusted, but list both
// explicitly so it's obvious).
const resolveTrustedOrigins = () => {
  const origins: string[] = []
  if (process.env.VERCEL_BRANCH_URL) {
    origins.push(`https://${process.env.VERCEL_BRANCH_URL}`)
  }
  if (process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`)
  }
  return origins
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  baseURL: resolveBaseURL(),
  trustedOrigins: resolveTrustedOrigins(),
  secret: process.env.BETTER_AUTH_SECRET,
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24 * 7,
    freshAge: 60 * 60,
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
      // after avatar upload (see server/plugins/queueConsumer.ts). The
      // client only reads it (input: false) to paint a placeholder
      // gradient under <AvatarImage>.
      imageBlurhash: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  },
  rateLimit: {
    storage: 'database',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/magic-link': { window: 60, max: 5 },
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
            message: m.login_unknown_email_error(),
          })
        }
        // sendMagicLink runs inside the request's Paraglide scope (the
        // /api/auth/* route goes through src/server.ts), so getLocale()
        // reflects the requester's cookie.
        await emailEffect.sendMagicLink({ to: email, url, locale: getLocale() })
        logger.info('magic-link sent', { email: normalized, userId: existingId ?? null })
      },
    }),
    admin(),
    passkey({
      rpID: new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:14500').hostname,
      rpName: 'Oceanview',
      origin: process.env.BETTER_AUTH_URL ?? 'http://localhost:14500',
    }),
    tanstackStartCookies(),
  ],
  advanced: {
    database: {
      generateId: 'uuid',
    },
    backgroundTasks: {
      handler: (promise) => waitUntil(promise),
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
          logger.info('auth session created', {
            userId: session.userId,
            ip: session.ipAddress ?? null,
            userAgent: session.userAgent ?? null,
          })
          // Stamp the welcome-back cookie at the moment of sign-in — both
          // magic-link and passkey flows continue with client-side navigation,
          // so the _authenticated beforeLoad write would otherwise not run
          // until the next full-page load. tanstackStartCookies() guarantees
          // this request runs inside TanStack Start's request context, which
          // is what writeBrowserSession's setCookie needs.
          try {
            const row = await userService.findRowById(session.userId)
            if (row) await rememberUser(session.userId, row.email)
          } catch (error) {
            logger.warn('welcome-back cookie write failed', { error })
          }
        },
      },
    },
  },
})
