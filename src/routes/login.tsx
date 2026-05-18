import { useForm } from '@tanstack/react-form'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { useSignInPasskeyAutofill } from '~/hooks/usePasskeys'
import { clearSavedEmail, useSavedEmail } from '~/hooks/useSavedLogin'
import { authClient } from '~/lib/authClient'
import { getSession } from '~/lib/getSession'

const loginSchema = z.object({
  email: z.email(),
})

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const session = await getSession()
    if (session) throw redirect({ to: '/' })
  },
  component: Login,
})

function Login() {
  const navigate = useNavigate()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [isSendingSaved, setIsSendingSaved] = useState(false)

  const savedEmail = useSavedEmail()

  useSignInPasskeyAutofill({
    onSignedIn: () => {
      navigate({ to: '/' })
    },
  })

  const form = useForm({
    defaultValues: { email: '' },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.signIn.magicLink({
        email: value.email,
        callbackURL: '/?passkey=setup',
      })
      if (error) {
        toast.error(error.message ?? 'Kunde inte skicka inloggningslänken')
        return
      }
      setSentTo(value.email)
    },
  })

  async function sendToSavedEmail(email: string) {
    setIsSendingSaved(true)
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: '/?passkey=setup',
    })
    setIsSendingSaved(false)
    if (error) {
      toast.error(error.message ?? 'Kunde inte skicka inloggningslänken')
      return
    }
    setSentTo(email)
  }

  function useDifferentEmail() {
    clearSavedEmail()
  }

  const showAvatarCard = savedEmail && !sentTo

  return (
    <div className="grid min-h-svh place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{showAvatarCard ? 'Välkommen tillbaka' : 'Oceanview'}</CardTitle>
          <CardDescription>
            {sentTo
              ? 'Inloggningslänken är på väg.'
              : showAvatarCard
                ? 'Fortsätt med ditt senaste konto.'
                : 'Logga in med en länk som vi skickar till din e-post.'}
          </CardDescription>
        </CardHeader>

        {sentTo ? (
          <CardContent className="text-muted-foreground text-sm">
            Vi har skickat en inloggningslänk till{' '}
            <strong className="text-foreground">{sentTo}</strong>. Kolla din inkorg (eller
            serverloggen tills vidare) och följ länken för att fortsätta.
          </CardContent>
        ) : showAvatarCard && savedEmail ? (
          <>
            <CardContent className="flex flex-col items-center gap-3">
              <div
                aria-hidden="true"
                className="grid size-16 place-items-center rounded-full bg-muted font-semibold text-2xl text-muted-foreground"
              >
                {savedEmail[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="break-all text-center font-medium text-sm">{savedEmail}</div>
            </CardContent>
            <CardFooter className="flex-col gap-3">
              <Button
                type="button"
                className="w-full"
                disabled={isSendingSaved}
                onClick={() => {
                  void sendToSavedEmail(savedEmail)
                }}
              >
                {isSendingSaved && <Spinner data-icon="inline-start" />}
                {isSendingSaved ? 'Skickar…' : 'Skicka inloggningslänk'}
              </Button>

              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-muted-foreground text-sm"
                onClick={useDifferentEmail}
              >
                Logga in som annan användare
              </Button>
            </CardFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              form.handleSubmit()
            }}
          >
            <CardContent>
              <FieldGroup>
                <form.Field
                  name="email"
                  children={(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>E-post</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          type="email"
                          autoComplete="username webauthn"
                          placeholder="du@exempel.se"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                          disabled={form.state.isSubmitting}
                        />
                        <FieldDescription className="pb-4">
                          Vi mejlar dig en engångslänk för inloggning.
                        </FieldDescription>
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </Field>
                    )
                  }}
                />
              </FieldGroup>
            </CardContent>

            <CardFooter className="flex-col gap-3">
              <form.Subscribe
                selector={(state) => [state.canSubmit, state.isSubmitting]}
                children={([canSubmit, isSubmitting]) => (
                  <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
                    {isSubmitting && <Spinner data-icon="inline-start" />}
                    {isSubmitting ? 'Skickar…' : 'Skicka inloggningslänk'}
                  </Button>
                )}
              />
            </CardFooter>
          </form>
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
      </Card>
    </div>
  )
}
