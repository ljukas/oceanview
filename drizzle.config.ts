import { defineConfig } from 'drizzle-kit'

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!
const isLocal = url.includes('localhost') || url.includes('127.0.0.1')

// Diagnostic: log just the hostname of the DB URL during config load.
// No credentials surface — only host. Useful to confirm Vercel build env vs runtime.
try {
  const host = new URL(url).hostname
  console.log(`[drizzle.config] DATABASE host = ${host} (source: ${process.env.DATABASE_URL_UNPOOLED ? 'DATABASE_URL_UNPOOLED' : 'DATABASE_URL'})`)
} catch {
  console.log(`[drizzle.config] DATABASE URL is empty or invalid`)
}

if (isLocal) {
  // Neon Local uses self-signed certs. node-postgres (which drizzle-kit uses)
  // treats sslmode=require as verify-full, rejecting them. Skip cert
  // verification for local only — never leaks to prod (Neon cloud has valid certs).
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema',
  out: './drizzle',
  dbCredentials: { url },
  casing: 'snake_case',
})
