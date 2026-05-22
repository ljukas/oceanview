import { toast } from 'sonner'
import { z } from 'zod'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { FieldGroup } from '~/components/ui/field'
import { useAppForm } from '~/hooks/form'
import { authClient } from '~/lib/authClient'

const loginSchema = z.object({
  email: z.email(),
})

type Props = { onSent: (email: string) => void; callbackURL: string }

export function LoginFormCard({ onSent, callbackURL }: Props) {
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
        <CardDescription>Logga in med en länk som vi skickar till din e-post.</CardDescription>
      </CardHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <CardContent className="pb-4">
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
        </CardContent>

        <CardFooter className="flex-col gap-3">
          <form.AppForm>
            <form.SubmitButton
              label="Skicka inloggningslänk"
              pendingLabel="Skickar…"
              className="w-full"
            />
          </form.AppForm>
        </CardFooter>
      </form>
    </Card>
  )
}
