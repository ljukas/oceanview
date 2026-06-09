import { useQuery } from '@tanstack/react-query'
import { KeyRoundIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Spinner } from '~/components/ui/spinner'
import { usePasskeySupport } from '~/hooks/usePasskeys'
import { authClient } from '~/lib/authClient'
import { orpc } from '~/lib/orpc/client'

type Props = {
  email: string
  onSent: (email: string) => void
  onSwitchUser: () => void
  onPasskeySignIn: () => void
  passkeyPending: boolean
  callbackURL: string
}

export function WelcomeBackCard({
  email,
  onSent,
  onSwitchUser,
  onPasskeySignIn,
  passkeyPending,
  callbackURL,
}: Props) {
  const passkeySupported = usePasskeySupport()
  const [isSending, setIsSending] = useState(false)

  // Fetch the avatar live by email rather than caching it in the cookie (where
  // it would go stale). Non-blocking: the card renders the initials fallback
  // immediately and swaps in the avatar once the query resolves.
  const { data: avatar } = useQuery(orpc.user.avatarByEmail.queryOptions({ input: { email } }))
  const image = avatar?.image ?? null
  const imageBlurhash = avatar?.imageBlurhash ?? null

  async function sendMagicLink() {
    setIsSending(true)
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL,
    })
    setIsSending(false)
    if (error) {
      toast.error(error.message ?? 'Kunde inte skicka inloggningslänken')
      return
    }
    onSent(email)
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Välkommen tillbaka</CardTitle>
        <CardDescription>Fortsätt med ditt senaste konto.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <Avatar className="size-16">
          {image ? (
            <AvatarImage src={image} alt={email} width={64} height={64} blurhash={imageBlurhash} />
          ) : null}
          <AvatarFallback className="font-semibold text-2xl">
            {email[0]?.toUpperCase() ?? '?'}
          </AvatarFallback>
        </Avatar>
        <div className="break-all text-center font-medium text-sm">{email}</div>
      </CardContent>
      <CardFooter className="flex-col gap-3">
        {passkeySupported && (
          <Button
            type="button"
            className="w-full"
            disabled={passkeyPending}
            onClick={onPasskeySignIn}
          >
            {passkeyPending ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon />}
            Logga in med passkey
          </Button>
        )}

        <Button
          type="button"
          variant={passkeySupported ? 'outline' : 'default'}
          className="w-full"
          disabled={isSending}
          onClick={() => {
            void sendMagicLink()
          }}
        >
          {isSending && <Spinner data-icon="inline-start" />}
          {isSending ? 'Skickar…' : 'Skicka inloggningslänk'}
        </Button>

        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-muted-foreground text-sm"
          onClick={onSwitchUser}
        >
          Logga in som annan användare
        </Button>
      </CardFooter>
    </Card>
  )
}
