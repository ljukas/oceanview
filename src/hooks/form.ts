import { createFormHook, createFormHookContexts } from '@tanstack/react-form'
import { PhoneField } from '~/components/form/PhoneField'
import { SelectField } from '~/components/form/SelectField'
import { SubmitButton } from '~/components/form/SubmitButton'
import { TextField } from '~/components/form/TextField'
import { ToggleField } from '~/components/form/ToggleField'

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, SelectField, PhoneField, ToggleField },
  formComponents: { SubmitButton },
})
