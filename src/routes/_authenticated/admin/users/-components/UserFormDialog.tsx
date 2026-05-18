import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Spinner } from '~/components/ui/spinner'
import { orpc } from '~/lib/orpc/client'

const formSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().min(5).max(30),
  role: z.enum(['user', 'admin']),
})

type FormValues = z.infer<typeof formSchema>

const emptyDefaults: FormValues = {
  name: '',
  email: '',
  phone: '',
  role: 'user',
}

type Props = {
  open: boolean
  userId?: string
  onOpenChange: (open: boolean) => void
}

export function UserFormDialog({ open, userId, onOpenChange }: Props) {
  const isEdit = userId !== undefined
  const title = isEdit ? 'Redigera användare' : 'Ny användare'
  const description = isEdit
    ? 'Uppdatera uppgifterna nedan.'
    : 'Fyll i uppgifterna för den nya användaren.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Suspense
          fallback={
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          }
        >
          {isEdit ? (
            <EditUserForm key={userId} userId={userId} onDone={() => onOpenChange(false)} />
          ) : (
            <CreateUserForm onDone={() => onOpenChange(false)} />
          )}
        </Suspense>
      </DialogContent>
    </Dialog>
  )
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()

  const createMutation = useMutation(
    orpc.user.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.user.list.key(),
        })
        toast.success('Användaren skapades')
        onDone()
      },
      onError: (err) => {
        toast.error(err.message || 'Kunde inte skapa användaren')
      },
    }),
  )

  return (
    <UserForm
      defaultValues={emptyDefaults}
      submitLabel="Skapa användare"
      onSubmit={(values) => createMutation.mutateAsync(values)}
      onCancel={onDone}
    />
  )
}

function EditUserForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const { data: user } = useSuspenseQuery(orpc.user.getById.queryOptions({ input: { id: userId } }))

  const updateMutation = useMutation(
    orpc.user.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.user.list.key(),
        })
        toast.success('Användaren uppdaterades')
        onDone()
      },
      onError: (err) => {
        toast.error(err.message || 'Kunde inte uppdatera användaren')
      },
    }),
  )

  const defaultValues: FormValues = {
    name: user.name,
    email: user.email,
    phone: user.phone ?? '',
    role: user.role === 'admin' ? 'admin' : 'user',
  }

  return (
    <UserForm
      defaultValues={defaultValues}
      submitLabel="Spara"
      onSubmit={(values) => updateMutation.mutateAsync({ id: userId, ...values })}
      onCancel={onDone}
    />
  )
}

function UserForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  defaultValues: FormValues
  submitLabel: string
  onSubmit: (values: FormValues) => Promise<unknown>
  onCancel: () => void
}) {
  const form = useForm({
    defaultValues,
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      await onSubmit(value)
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field
          name="name"
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Namn</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  autoComplete="name"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                  disabled={form.state.isSubmitting}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />

        <form.Field
          name="email"
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>E-post</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                  disabled={form.state.isSubmitting}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />

        <form.Field
          name="phone"
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Telefon</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="tel"
                  autoComplete="tel"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                  disabled={form.state.isSubmitting}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />

        <form.Field
          name="role"
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Roll</FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as FormValues['role'])}
                  disabled={form.state.isSubmitting}
                >
                  <SelectTrigger id={field.name} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Seglare</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
      </FieldGroup>

      <DialogFooter className="mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={form.state.isSubmitting}
        >
          Avbryt
        </Button>
        <form.Subscribe
          selector={(s) => [s.canSubmit, s.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              {submitLabel}
            </Button>
          )}
        />
      </DialogFooter>
    </form>
  )
}
