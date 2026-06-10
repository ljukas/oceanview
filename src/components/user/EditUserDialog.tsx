import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Spinner } from '~/components/ui/spinner'
import {
  type UserFieldsValues,
  UserFormFields,
  userFieldsMap,
  userFieldsSchema,
} from '~/components/user/UserFormFields'
import { useAppForm } from '~/hooks/form'
import { orpc } from '~/lib/orpc/client'

type Props = {
  open: boolean
  userId?: string
  onOpenChange: (open: boolean) => void
}

export function EditUserDialog({ open, userId, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Redigera användare</DialogTitle>
          <DialogDescription>Uppdatera uppgifterna nedan.</DialogDescription>
        </DialogHeader>
        {userId ? (
          <Suspense
            fallback={
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            }
          >
            <EditUserDialogBody key={userId} userId={userId} onDone={() => onOpenChange(false)} />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialogBody({ userId, onDone }: { userId: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const { data: user } = useSuspenseQuery(orpc.user.getById.queryOptions({ input: { id: userId } }))

  const updateMutation = useMutation(
    orpc.user.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.user.key(),
        })
        toast.success('Användaren uppdaterades')
        onDone()
      },
      onError: (err) => {
        toast.error(err.message || 'Kunde inte uppdatera användaren')
      },
    }),
  )

  const defaultValues: UserFieldsValues = {
    name: user.name,
    email: user.email,
    phone: user.phone ?? '',
    role: user.role === 'admin' ? 'admin' : 'user',
  }

  const form = useAppForm({
    defaultValues,
    validators: { onSubmit: userFieldsSchema },
    onSubmit: async ({ value }) => {
      await updateMutation.mutateAsync({ id: userId, ...value })
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <UserFormFields form={form} fields={userFieldsMap} />

      <DialogFooter className="mt-6">
        <form.AppForm>
          <form.CancelButton onClick={onDone}>Avbryt</form.CancelButton>
          <form.SubmitButton label="Spara" />
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}
