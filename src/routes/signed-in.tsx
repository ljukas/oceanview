import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { SignedInCard } from '~/components/login/SignedInCard'
import { getSession } from '~/lib/getSession'
import { sanitizeRedirect } from '~/lib/utils'

export const Route = createFileRoute('/signed-in')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const safe = sanitizeRedirect(search.redirect)
    return safe ? { redirect: safe } : {}
  },
  beforeLoad: async () => {
    const session = await getSession()
    // Link expired or already consumed — send them back to start over.
    if (!session) throw redirect({ to: '/login' })
  },
  component: SignedIn,
})

function SignedIn() {
  const navigate = useNavigate()
  const { redirect: redirectPath } = Route.useSearch()
  const destination = redirectPath ?? '/'

  function onContinue() {
    void navigate({
      to: destination,
      search: destination === '/' ? { passkey: 'setup' } : undefined,
    })
  }

  return (
    <div className="grid min-h-svh place-items-center p-4">
      <SignedInCard onContinue={onContinue} />
    </div>
  )
}
