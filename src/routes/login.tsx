import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { LoginFormCard } from '~/components/login/LoginFormCard'
import { MagicLinkSentCard } from '~/components/login/MagicLinkSentCard'
import { WelcomeBackCard } from '~/components/login/WelcomeBackCard'
import { useSignInPasskeyAutofill } from '~/hooks/usePasskeys'
import { clearBrowserSession, getBrowserSession } from '~/lib/browserSessionFns'
import { getSession } from '~/lib/getSession'

function sanitizeRedirect(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  return /^\/(?!\/)/.test(raw) ? raw : undefined
}

function buildCallbackURL(redirectPath: string | undefined): string {
  const base = redirectPath ?? '/'
  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}passkey=setup`
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const safe = sanitizeRedirect(search.redirect)
    return safe ? { redirect: safe } : {}
  },
  beforeLoad: async ({ search }) => {
    const session = await getSession()
    if (session) throw redirect({ to: search.redirect ?? '/' })
  },
  loader: async () => {
    const session = await getBrowserSession()
    const savedLogin = session?.email
      ? { email: session.email, image: session.image ?? null }
      : null
    return { savedLogin }
  },
  component: Login,
})

function Login() {
  const navigate = useNavigate()
  const { redirect: redirectPath } = Route.useSearch()
  const { savedLogin: initialSavedLogin } = Route.useLoaderData()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [useOther, setUseOther] = useState(false)

  const savedLogin = useOther ? null : initialSavedLogin
  const callbackURL = buildCallbackURL(redirectPath)

  useSignInPasskeyAutofill({
    onSignedIn: () => {
      navigate({ to: redirectPath ?? '/' })
    },
  })

  async function switchToOtherEmail() {
    await clearBrowserSession()
    setUseOther(true)
  }

  return (
    <div className="grid min-h-svh place-items-center p-4">
      {sentTo ? (
        <MagicLinkSentCard email={sentTo} />
      ) : savedLogin ? (
        <WelcomeBackCard
          email={savedLogin.email}
          image={savedLogin.image}
          callbackURL={callbackURL}
          onSent={setSentTo}
          onSwitchUser={() => {
            void switchToOtherEmail()
          }}
        />
      ) : (
        <LoginFormCard onSent={setSentTo} callbackURL={callbackURL} />
      )}
      <input
        type="text"
        name="webauthn-anchor"
        autoComplete="username webauthn"
        aria-hidden="true"
        tabIndex={-1}
        readOnly
        defaultValue={savedLogin?.email ?? ''}
        className="sr-only"
      />
    </div>
  )
}
