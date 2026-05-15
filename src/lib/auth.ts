import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { admin, magicLink } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from './db'
import * as schema from './db/schema'
import * as userService from './services/user'
import { isAllowlistedAdmin, normalizeEmail } from './admin-allowlist'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const normalized = normalizeEmail(email)
        const existingId = await userService.findIdByEmail(normalized)
        if (!existingId && !isAllowlistedAdmin(normalized)) {
          throw new APIError('BAD_REQUEST', {
            message: 'Inget konto finns för denna e-postadress. Kontakta en administratör för att läggas till.',
          })
        }
        console.log(`[magic-link] ${email}: ${url}`)
      },
    }),
    admin(),
    tanstackStartCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          if (isAllowlistedAdmin(user.email)) {
            await userService.setAdmin(user.id)
          }
        },
      },
    },
  },
})
