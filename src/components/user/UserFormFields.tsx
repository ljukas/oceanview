import { z } from 'zod'
import { FieldGroup } from '~/components/ui/field'
import { withFieldGroup } from '~/hooks/form'

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
    .email({ error: 'Ange en giltig e-postadress' })
    .min(1, { error: 'Ange en e-postadress' }),
  phone: z
    .string()
    .max(30, { error: 'Telefonnumret är för långt (max 30 tecken)' })
    .refine((v) => v === '' || v.length >= 5, {
      error: 'Telefonnumret är för kort (minst 5 tecken)',
    }),
  role: z.enum(['user', 'admin'], { error: 'Välj en roll' }),
})

export type UserFieldsValues = z.infer<typeof userFieldsSchema>

const roleOptions = [
  { value: 'user', label: 'Seglare' },
  { value: 'admin', label: 'Admin' },
] as const

export const userFieldsMap = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  role: 'role',
} as const

export const UserFormFields = withFieldGroup({
  defaultValues: userFieldsDefaults,
  render: function Render({ group }) {
    return (
      <FieldGroup>
        <group.AppField
          name="name"
          children={(field) => <field.TextField label="Namn" autoComplete="name" />}
        />
        <group.AppField
          name="email"
          children={(field) => <field.TextField label="E-post" type="email" autoComplete="email" />}
        />
        <group.AppField name="phone" children={(field) => <field.PhoneField label="Telefon" />} />
        <group.AppField
          name="role"
          children={(field) => <field.ToggleField label="Roll" options={roleOptions} />}
        />
      </FieldGroup>
    )
  },
})
