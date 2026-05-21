import { useStore } from '@tanstack/react-form'
import type { Country, Value } from 'react-phone-number-input'
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import { PhoneInput } from '~/components/ui/phone-input'
import { useFieldContext } from '~/hooks/form'

type Props = {
  label: string
  description?: string
  placeholder?: string
  defaultCountry?: Country
}

export function PhoneField({ label, description, placeholder, defaultCountry = 'SE' }: Props) {
  const field = useFieldContext<string>()
  const isSubmitting = useStore(field.form.store, (s) => s.isSubmitting)
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <PhoneInput
        id={field.name}
        name={field.name}
        international
        defaultCountry={defaultCountry}
        placeholder={placeholder}
        value={(field.state.value || undefined) as Value | undefined}
        onChange={(v) => field.handleChange((v ?? '') as string)}
        onBlur={field.handleBlur}
        disabled={isSubmitting}
        aria-invalid={isInvalid}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={field.state.meta.errors} />
    </Field>
  )
}
