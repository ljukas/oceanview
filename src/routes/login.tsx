import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { LoginFormCard } from '~/components/login/LoginFormCard'
import { MagicLinkSentCard } from '~/components/login/MagicLinkSentCard'
import { WelcomeBackCard } from '~/components/login/WelcomeBackCard'
import { useSignInPasskeyAutofill } from '~/hooks/usePasskeys'
import { getSession } from '~/lib/getSession'
import { clearSavedEmail, getSavedEmail } from '~/lib/savedEmailFns'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const session = await getSession()
    if (session) throw redirect({ to: '/' })
  },
  loader: async () => ({ savedEmail: await getSavedEmail() }),
  component: Login,
})

function Login() {
  const navigate = useNavigate()
  const { savedEmail: initialSavedEmail } = Route.useLoaderData()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [useOther, setUseOther] = useState(false)

  const savedEmail = useOther ? null : initialSavedEmail

  useSignInPasskeyAutofill({
    onSignedIn: () => {
      navigate({ to: '/' })
    },
  })

  async function switchToOtherEmail() {
    await clearSavedEmail()
    setUseOther(true)
  }

  return (
    <div className="grid min-h-svh place-items-center p-4">
      {sentTo ? (
        <MagicLinkSentCard email={sentTo} />
      ) : savedEmail ? (
        <WelcomeBackCard
          email={savedEmail}
          onSent={setSentTo}
          onSwitchUser={() => {
            void switchToOtherEmail()
          }}
        />
      ) : (
        <LoginFormCard onSent={setSentTo} />
      )}
      <input
        type="text"
        name="webauthn-anchor"
        autoComplete="username webauthn"
        aria-hidden="true"
        tabIndex={-1}
        readOnly
        defaultValue={savedEmail ?? ''}
        className="sr-only"
      />
    </div>
  )
}
