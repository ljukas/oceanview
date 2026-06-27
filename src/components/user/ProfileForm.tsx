import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { useAppForm } from '~/hooks/form'
import { logger } from '~/lib/logger/browser'
import { orpc } from '~/lib/orpc/client'
import { nameField, phoneField } from '~/lib/orpc/userProfileSchema'
import { m } from '~/paraglide/messages'

// name + phone reuse the shared validators (see ~/lib/orpc/userProfileSchema) so
// this self-service form can't validate differently from the `user.updateProfile`
// procedure that saves it. No `role` (a user can't change their own role) and no
// editable `email` (immutable login identity — shown read-only below; ADR-0017).
const profileSchema = z.object({ name: nameField, phone: phoneField })

export function ProfileForm() {
  const { data: me } = useSuspenseQuery(orpc.user.me.queryOptions())
  const queryClient = useQueryClient()
  const updateMutation = useMutation(orpc.user.updateProfile.mutationOptions())

  const form = useAppForm({
    defaultValues: { name: me.name, phone: me.phone ?? '' },
    validators: { onSubmit: profileSchema },
    onSubmit: async ({ value }) => {
      try {
        await updateMutation.mutateAsync(value)
      } catch (error) {
        logger.warn('profile save failed', { error })
        toast.error(m.user_update_error())
        return
      }
      // Name/phone surface in the contact list and the avatar initials. Refetch
      // `me` (not just invalidate) so this tab reflects the change immediately —
      // useRealtimeSync ignores events from its own source — and invalidate the
      // owner lists so they're fresh on next visit (mirrors AvatarUpload).
      await queryClient.refetchQueries({ queryKey: orpc.user.me.key() })
      queryClient.invalidateQueries({ queryKey: orpc.user.list.key() })
      queryClient.invalidateQueries({ queryKey: orpc.user.listContacts.key() })
      toast.success(m.account_profile_saved())
    },
  })

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldGroup>
        {/* Email is the magic-link login identity, immutable after invite
            (ADR-0017) — read-only for context. This is the self-service view, so
            the hint just states it can't be changed (the admin "delete + re-invite
            to change it" workaround lives in EditUserDialog, not here). */}
        <Field>
          <FieldLabel htmlFor="profile-email">{m.user_field_email()}</FieldLabel>
          <Input id="profile-email" type="email" value={me.email} disabled readOnly />
          <FieldDescription>{m.account_email_locked_hint()}</FieldDescription>
        </Field>
        <form.AppField
          name="name"
          children={(field) => <field.TextField label={m.user_field_name()} autoComplete="name" />}
        />
        <form.AppField
          name="phone"
          children={(field) => <field.PhoneField label={m.user_field_phone()} />}
        />
      </FieldGroup>

      <form.AppForm>
        <form.SubmitButton label={m.common_save()} className="self-start" />
      </form.AppForm>
    </form>
  )
}
