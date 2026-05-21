import { logger } from '~/lib/logger/server'
import type { EmailEffects } from '../email'

export const devLog: EmailEffects = {
  async sendMagicLink({ to, url }) {
    logger.info('magic-link (devLog)', { to, url })
  },
}
