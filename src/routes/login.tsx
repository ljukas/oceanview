import { createFileRoute, redirect } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { authClient } from '~/lib/auth-client'
import { getSession } from '~/lib/get-session'

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
  const [sentTo, setSentTo] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { email: '' },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.signIn.magicLink({
        email: value.email,
        callbackURL: '/',
      })
      if (error) {
        toast.error(error.message ?? 'Kunde inte skicka inloggningslänken')
        return
      }
      setSentTo(value.email)
    },
  })

  return (
    <div className="grid min-h-svh place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Oceanview</CardTitle>
          <CardDescription>
            {sentTo
              ? 'Inloggningslänken är på väg.'
              : 'Logga in med en länk som vi skickar till din e-post.'}
          </CardDescription>
        </CardHeader>

        {sentTo ? (
          <CardContent className="text-sm text-muted-foreground">
            Vi har skickat en inloggningslänk till{' '}
            <strong className="text-foreground">{sentTo}</strong>. Kolla din inkorg
            (eller serverloggen tills vidare) och följ länken för att fortsätta.
          </CardContent>
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
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>E-post</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          type="email"
                          autoComplete="email"
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
                        {isInvalid && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                />
              </FieldGroup>
            </CardContent>
            <CardFooter >
              <form.Subscribe
                selector={(state) => [state.canSubmit, state.isSubmitting]}
                children={([canSubmit, isSubmitting]) => (
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!canSubmit || isSubmitting}
                  >
                    {isSubmitting && <Spinner data-icon="inline-start" />}
                    {isSubmitting ? 'Skickar…' : 'Skicka inloggningslänk'}
                  </Button>
                )}
              />
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}
