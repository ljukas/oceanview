import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
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
        toast.success('Användaren skapades')
        onOpenChange(false)
      },
      onError: (err) => {
        toast.error(err.message || 'Kunde inte skapa användaren')
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
          <DialogTitle>Ny användare</DialogTitle>
          <DialogDescription>Fyll i uppgifterna för den nya användaren.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <UserFormFields form={form} fields={userFieldsMap} />

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={form.state.isSubmitting}
            >
              Avbryt
            </Button>
            <form.AppForm>
              <form.SubmitButton label="Skapa användare" />
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
