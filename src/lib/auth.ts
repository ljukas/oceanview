import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { admin, magicLink } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { eq } from 'drizzle-orm'
import { db } from './db'
import * as schema from './db/schema'

const adminEmails = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
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
          if (adminEmails.includes(user.email.toLowerCase())) {
            await db
              .update(schema.user)
              .set({ role: 'admin' })
              .where(eq(schema.user.id, user.id))
          }
        },
      },
    },
  },
})
