import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import { FieldGroup } from '~/components/ui/field'
import { useAppForm } from '~/hooks/form'
import { orpc } from '~/lib/orpc/client'
import { m } from '~/paraglide/messages'

const phoneSchema = z.object({
  phone: z
    .string()
    .max(30, { error: () => m.validation_phone_too_long() })
    .refine((v) => v === '' || v.length >= 5, { error: () => m.validation_phone_too_short() }),
})

type Props = {
  onNext: () => void
  onSkip: () => void
  onBack: () => void
}

export function OnboardingPhoneStep({ onNext, onSkip, onBack }: Props) {
  const { data: me } = useSuspenseQuery(orpc.user.me.queryOptions())
  const updateMutation = useMutation(orpc.user.updateProfile.mutationOptions())

  const form = useAppForm({
    defaultValues: { phone: me.phone ?? '' },
    validators: { onSubmit: phoneSchema },
    onSubmit: async ({ value }) => {
      try {
        await updateMutation.mutateAsync({ phone: value.phone })
      } catch {
        toast.error(m.onboarding_save_error())
        return
      }
      onNext()
    },
  })

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-1.5 text-center">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          {m.onboarding_phone_title()}
        </h1>
        <p className="text-balance text-muted-foreground text-sm">
          {m.onboarding_phone_description()}
        </p>
      </header>

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.AppField
            name="phone"
            children={(field) => (
              <field.FloatingTextField
                label={m.onboarding_phone_label()}
                type="tel"
                autoComplete="tel"
                autoFocus
              />
            )}
          />
        </FieldGroup>

        <form.AppForm>
          <form.SubmitButton
            label={m.onboarding_next()}
            pendingLabel={m.onboarding_next()}
            size="xl"
            className="w-full font-normal"
          />
        </form.AppForm>
      </form>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeftIcon />
          {m.common_back()}
        </Button>
        <Button type="button" variant="ghost" onClick={onSkip}>
          {m.onboarding_skip()}
        </Button>
      </div>
    </div>
  )
}
