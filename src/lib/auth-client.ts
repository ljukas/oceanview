import { createAuthClient } from 'better-auth/react'
import { adminClient, magicLinkClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), adminClient()],
})
