import { devLog } from './adapters/devLog'

export interface EmailEffects {
  sendMagicLink(input: { to: string; url: string }): Promise<void>
}

export const email: EmailEffects = devLog
