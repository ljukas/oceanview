import { createFormHook, createFormHookContexts } from '@tanstack/react-form'
import { CancelButton } from '~/components/form/CancelButton'
import { DateField } from '~/components/form/DateField'
import { PhoneField } from '~/components/form/PhoneField'
import { SelectField } from '~/components/form/SelectField'
import { SubmitButton } from '~/components/form/SubmitButton'
import { TextField } from '~/components/form/TextField'
import { ToggleField } from '~/components/form/ToggleField'
import { UserSelectField } from '~/components/form/UserSelectField'

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, SelectField, PhoneField, ToggleField, DateField, UserSelectField },
  formComponents: { SubmitButton, CancelButton },
})
