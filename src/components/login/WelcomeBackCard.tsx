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
import { m } from '~/paraglide/messages'

type Props = {
  email: string
  // Cookie hint from the last authenticated visit; undefined means unknown
  // (pre-hint cookie) and gets the optimistic passkey-first treatment.
  hasPasskey: boolean | undefined
  // Resolved server-side by the login loader from the cookie's email — kept
  // out of the cookie itself so it never goes stale.
  image: string | null
  imageBlurhash: string | null
  onSent: (email: string) => void
  onSwitchUser: () => void
  onPasskeySignIn: () => void
  passkeyPending: boolean
  callbackURL: string
}

export function WelcomeBackCard({
  email,
  hasPasskey,
  image,
  imageBlurhash,
  onSent,
  onSwitchUser,
  onPasskeySignIn,
  passkeyPending,
  callbackURL,
}: Props) {
  const passkeySupported = usePasskeySupport()
  const [isSending, setIsSending] = useState(false)

  async function sendMagicLink() {
    setIsSending(true)
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL,
    })
    setIsSending(false)
    if (error) {
      toast.error(error.message ?? m.login_send_error())
      return
    }
    onSent(email)
  }

  // Lead with the passkey unless we know the account doesn't have one — then the
  // magic link is the path that actually works and the passkey button steps back.
  const passkeyFirst = hasPasskey !== false

  const passkeyButton = passkeySupported ? (
    <Button
      type="button"
      variant={passkeyFirst ? 'default' : 'outline'}
      className="w-full"
      disabled={passkeyPending}
      onClick={onPasskeySignIn}
    >
      {passkeyPending ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon />}
      {m.login_passkey_button()}
    </Button>
  ) : null

  const magicLinkButton = (
    <Button
      type="button"
      variant={passkeySupported && passkeyFirst ? 'outline' : 'default'}
      className="w-full"
      disabled={isSending}
      onClick={() => {
        void sendMagicLink()
      }}
    >
      {isSending && <Spinner data-icon="inline-start" />}
      {isSending ? m.login_submit_pending() : m.login_submit()}
    </Button>
  )

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{m.login_welcome_back_title()}</CardTitle>
        <CardDescription>{m.login_welcome_back_description()}</CardDescription>
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
        {passkeyFirst ? (
          <>
            {passkeyButton}
            {magicLinkButton}
          </>
        ) : (
          <>
            {magicLinkButton}
            {passkeyButton}
          </>
        )}

        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-muted-foreground text-sm"
          onClick={onSwitchUser}
        >
          {m.login_switch_user()}
        </Button>
      </CardFooter>
    </Card>
  )
}
