import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server'

export const SAVED_EMAIL_COOKIE = 'oceanview-saved-email'

const COOKIE_OPTIONS = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  httpOnly: false,
} as const

export function readSavedEmail(): string | null {
  const value = getCookie(SAVED_EMAIL_COOKIE)
  return value?.includes('@') ? value : null
}

export function writeSavedEmail(email: string): void {
  setCookie(SAVED_EMAIL_COOKIE, email, COOKIE_OPTIONS)
}

export function expireSavedEmail(): void {
  deleteCookie(SAVED_EMAIL_COOKIE, { path: '/', sameSite: 'lax' })
}
