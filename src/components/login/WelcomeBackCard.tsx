import { useState } from 'react'
import { toast } from 'sonner'
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
import { authClient } from '~/lib/authClient'

type Props = {
  email: string
  onSent: (email: string) => void
  onSwitchUser: () => void
}

export function WelcomeBackCard({ email, onSent, onSwitchUser }: Props) {
  const [isSending, setIsSending] = useState(false)

  async function sendMagicLink() {
    setIsSending(true)
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: '/?passkey=setup',
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
        <div
          aria-hidden="true"
          className="grid size-16 place-items-center rounded-full bg-muted font-semibold text-2xl text-muted-foreground"
        >
          {email[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="break-all text-center font-medium text-sm">{email}</div>
      </CardContent>
      <CardFooter className="flex-col gap-3">
        <Button
          type="button"
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
