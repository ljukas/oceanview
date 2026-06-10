import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import {
  UserFormFields,
  userFieldsDefaults,
  userFieldsMap,
  userFieldsSchema,
} from '~/components/user/UserFormFields'
import { useAppForm } from '~/hooks/form'
import { orpc } from '~/lib/orpc/client'
import { m } from '~/paraglide/messages'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateUserDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient()

  const createMutation = useMutation(
    orpc.user.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.user.list.key(),
        })
        toast.success(m.user_created())
        onOpenChange(false)
      },
      onError: (err) => {
        toast.error(err.message || m.user_create_error())
      },
    }),
  )

  const form = useAppForm({
    defaultValues: userFieldsDefaults,
    validators: { onSubmit: userFieldsSchema },
    onSubmit: async ({ value, formApi }) => {
      await createMutation.mutateAsync(value)
      formApi.reset()
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.user_create_title()}</DialogTitle>
          <DialogDescription>{m.user_create_description()}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <UserFormFields form={form} fields={userFieldsMap} />

          <DialogFooter className="mt-6">
            <form.AppForm>
              <form.CancelButton onClick={() => onOpenChange(false)}>
                {m.common_cancel()}
              </form.CancelButton>
              <form.SubmitButton label={m.user_create_submit()} />
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
