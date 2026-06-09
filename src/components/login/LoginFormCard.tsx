import { KeyRoundIcon } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { FieldGroup } from '~/components/ui/field'
import { Separator } from '~/components/ui/separator'
import { Spinner } from '~/components/ui/spinner'
import { useAppForm } from '~/hooks/form'
import { usePasskeySupport } from '~/hooks/usePasskeys'
import { authClient } from '~/lib/authClient'

const loginSchema = z.object({
  email: z.email(),
})

type Props = {
  onSent: (email: string) => void
  callbackURL: string
  onPasskeySignIn: () => void
  passkeyPending: boolean
}

export function LoginFormCard({ onSent, callbackURL, onPasskeySignIn, passkeyPending }: Props) {
  const passkeySupported = usePasskeySupport()
  const form = useAppForm({
    defaultValues: { email: '' },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.signIn.magicLink({
        email: value.email,
        callbackURL,
      })
      if (error) {
        toast.error(error.message ?? 'Kunde inte skicka inloggningslänken')
        return
      }
      onSent(value.email)
    },
  })

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Oceanview</CardTitle>
        <CardDescription>Logga in med en passkey eller en länk till din e-post.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {passkeySupported && (
          <>
            <Button
              type="button"
              className="w-full"
              disabled={passkeyPending}
              onClick={onPasskeySignIn}
            >
              {passkeyPending ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon />}
              Logga in med passkey
            </Button>
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs">eller</span>
              <Separator className="flex-1" />
            </div>
          </>
        )}

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.AppField
              name="email"
              children={(field) => (
                <field.TextField
                  label="E-post"
                  type="email"
                  autoComplete="username webauthn"
                  placeholder="du@exempel.se"
                />
              )}
            />
          </FieldGroup>

          <form.AppForm>
            <form.SubmitButton
              label="Skicka inloggningslänk"
              pendingLabel="Skickar…"
              variant={passkeySupported ? 'outline' : 'default'}
              className="w-full"
            />
          </form.AppForm>
        </form>
      </CardContent>
    </Card>
  )
}
