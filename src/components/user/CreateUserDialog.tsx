import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '~/components/ui/responsive-dialog'
import {
  UserFormFields,
  userFieldsDefaults,
  userFieldsMap,
  userFieldsSchema,
} from '~/components/user/UserFormFields'
import { useAppForm } from '~/hooks/form'
import { orpc } from '~/lib/orpc/client'
import { optimisticInsert } from '~/lib/orpc/optimistic'
import { m } from '~/paraglide/messages'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateUserDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient()

  const createMutation = useMutation(
    orpc.user.create.mutationOptions({
      // Append a placeholder row to the active owners list before the round-trip.
      // The real id/avatar come from the server, so this is a temp row purely for
      // UX — onSettled re-syncs the list to the backend's truth (which also drops
      // the placeholder on failure). user.create is message-based (Better Auth),
      // so the new row is the confirmation and only failures toast.
      onMutate: (vars) =>
        optimisticInsert(queryClient, orpc.user.listContacts.queryKey(), {
          id: crypto.randomUUID(),
          name: vars.name,
          email: vars.email,
          phone: vars.phone || null,
          role: vars.role,
          image: null,
          imageBlurhash: null,
          createdAt: new Date(),
          deletedAt: null,
          shares: [],
        }),
      onError: (err) => {
        toast.error(err.message || m.user_create_error())
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.user.key() }),
    }),
  )

  const form = useAppForm({
    defaultValues: userFieldsDefaults,
    validators: { onSubmit: userFieldsSchema },
    onSubmit: ({ value, formApi }) => {
      // Optimistic instant-close: onMutate paints the placeholder row, we reset and
      // close now, and onError/onSettled reconcile in the background.
      createMutation.mutate(value)
      formApi.reset()
      onOpenChange(false)
    },
  })

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{m.user_create_title()}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{m.user_create_description()}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <UserFormFields form={form} fields={userFieldsMap} />

          <ResponsiveDialogFooter className="mt-6">
            <form.AppForm>
              <form.CancelButton onClick={() => onOpenChange(false)}>
                {m.common_cancel()}
              </form.CancelButton>
              <form.SubmitButton label={m.user_create_submit()} />
            </form.AppForm>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
