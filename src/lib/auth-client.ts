import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { adminClient, magicLinkClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { useCallback } from 'react'

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), adminClient()],
})

export function useSignOut() {
  const router = useRouter()
  const queryClient = useQueryClient()

  return useCallback(async () => {
    await authClient.signOut()
    queryClient.clear()
    await router.invalidate()
    await router.navigate({ to: '/login' })
  }, [router, queryClient])
}
