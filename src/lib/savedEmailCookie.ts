import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'

export const SAVED_LOGIN_COOKIE = 'oceanview-saved-email'

const COOKIE_OPTIONS = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  httpOnly: false,
} as const

export const savedLoginSchema = z.object({
  email: z.email(),
  image: z.string().url().nullable(),
})

export type SavedLogin = z.infer<typeof savedLoginSchema>

export function readSavedLogin(): SavedLogin | null {
  const value = getCookie(SAVED_LOGIN_COOKIE)
  if (!value) return null
  try {
    const parsed = savedLoginSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeSavedLogin(login: SavedLogin): void {
  setCookie(SAVED_LOGIN_COOKIE, JSON.stringify(login), COOKIE_OPTIONS)
}

export function expireSavedLogin(): void {
  deleteCookie(SAVED_LOGIN_COOKIE, { path: '/', sameSite: 'lax' })
}
