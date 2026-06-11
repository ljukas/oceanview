import { z } from 'zod'
import { FieldGroup } from '~/components/ui/field'
import { withFieldGroup } from '~/hooks/form'
import { m } from '~/paraglide/messages'

export const userFieldsDefaults: {
  name: string
  email: string
  phone: string
  role: 'user' | 'admin'
} = {
  name: '',
  email: '',
  phone: '',
  role: 'user',
}

export const userFieldsSchema = z.object({
  name: z.string(),
  email: z
    .email({ error: () => m.validation_email_invalid() })
    .min(1, { error: () => m.validation_email_required() }),
  phone: z
    .string()
    .max(30, { error: () => m.validation_phone_too_long() })
    .refine((v) => v === '' || v.length >= 5, {
      error: () => m.validation_phone_too_short(),
    }),
  role: z.enum(['user', 'admin'], { error: () => m.validation_role_required() }),
})

export type UserFieldsValues = z.infer<typeof userFieldsSchema>

export const userFieldsMap = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  role: 'role',
} as const

export const UserFormFields = withFieldGroup({
  defaultValues: userFieldsDefaults,
  render: function Render({ group }) {
    // Built in render, not at module level, so the labels follow the active locale.
    const roleOptions = [
      { value: 'user', label: m.user_role_sailor() },
      { value: 'admin', label: m.user_role_admin() },
    ] as const
    return (
      <FieldGroup>
        <group.AppField
          name="name"
          children={(field) => <field.TextField label={m.user_field_name()} autoComplete="name" />}
        />
        <group.AppField
          name="email"
          children={(field) => (
            <field.TextField label={m.user_field_email()} type="email" autoComplete="email" />
          )}
        />
        <group.AppField
          name="phone"
          children={(field) => <field.PhoneField label={m.user_field_phone()} />}
        />
        <group.AppField
          name="role"
          children={(field) => (
            <field.ToggleField label={m.user_field_role()} options={roleOptions} />
          )}
        />
      </FieldGroup>
    )
  },
})
