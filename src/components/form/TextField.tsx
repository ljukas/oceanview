import { useStore } from '@tanstack/react-form'
import type { ComponentProps, KeyboardEventHandler } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { useFieldContext } from '~/hooks/form'

type Props = {
  label: string
  description?: string
  type?: ComponentProps<typeof Input>['type']
  autoComplete?: string
  placeholder?: string
  autoFocus?: boolean
  inputClassName?: string
  srOnlyLabel?: boolean
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
}

export function TextField({
  label,
  description,
  type = 'text',
  autoComplete,
  placeholder,
  autoFocus,
  inputClassName,
  srOnlyLabel,
  onKeyDown,
}: Props) {
  const field = useFieldContext<string>()
  const isSubmitting = useStore(field.form.store, (s) => s.isSubmitting)
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name} className={srOnlyLabel ? 'sr-only' : undefined}>
        {label}
      </FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={inputClassName}
        onKeyDown={onKeyDown}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        aria-invalid={isInvalid}
        disabled={isSubmitting}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={field.state.meta.errors} />
    </Field>
  )
}
