import { logger } from '~/lib/logger/server'
import type { EmailEffects } from '../email'

export const devLog: EmailEffects = {
  async sendMagicLink({ to, url, locale }) {
    // In prod this adapter only runs on email misconfiguration; the URL is a
    // live sign-in link, so never write it to Runtime Logs (ADR-0008).
    const safeUrl = process.env.NODE_ENV === 'production' ? '[redacted]' : url
    logger.info('magic-link (devLog)', { to, url: safeUrl, locale })
  },
}
