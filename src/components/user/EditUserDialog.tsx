import { isDefinedError } from '@orpc/client'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
import { toast } from 'sonner'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '~/components/ui/responsive-dialog'
import { Spinner } from '~/components/ui/spinner'
import {
  type UserFieldsValues,
  UserFormFields,
  userFieldsMap,
  userFieldsSchema,
} from '~/components/user/UserFormFields'
import { useAppForm } from '~/hooks/form'
import { orpc } from '~/lib/orpc/client'
import { optimisticPatch, optimisticReplace } from '~/lib/orpc/optimistic'
import { userErrorMessage } from '~/lib/orpc/userErrorMessage'
import { m } from '~/paraglide/messages'

type Props = {
  open: boolean
  userId?: string
  onOpenChange: (open: boolean) => void
}

export function EditUserDialog({ open, userId, onOpenChange }: Props) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{m.user_edit_title()}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{m.user_edit_description()}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
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
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

function EditUserDialogBody({ userId, onDone }: { userId: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const { data: user } = useSuspenseQuery(orpc.user.getById.queryOptions({ input: { id: userId } }))

  const updateMutation = useMutation(
    orpc.user.update.mutationOptions({
      // Paint the edited fields into the active owners list AND the getById detail
      // cache before the round-trip; the updated row is the confirmation, so
      // there's no success toast. Patching getById too is what keeps a second edit
      // from prefilling stale values — onSettled only marks it stale, and nothing
      // refetches it while the (instant-closed) dialog is unmounted.
      onMutate: (vars) =>
        Promise.all([
          optimisticPatch(
            queryClient,
            orpc.user.listContacts.queryKey(),
            (u) => u.id === userId,
            (u) => ({
              ...u,
              name: vars.name,
              email: vars.email,
              phone: vars.phone,
              role: vars.role,
            }),
          ),
          optimisticReplace(
            queryClient,
            orpc.user.getById.queryKey({ input: { id: userId } }),
            (u) => ({
              ...u,
              name: vars.name,
              email: vars.email,
              phone: vars.phone,
              role: vars.role,
            }),
          ),
        ]),
      // onError/onSettled live on useMutation (not the mutate call) so they still
      // run after the instant close below. onSettled re-syncs every user query,
      // reverting the optimistic patch on failure.
      onError: (err) => {
        toast.error(
          isDefinedError(err) ? userErrorMessage(err.code, 'demote') : m.user_update_error(),
        )
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.user.key() }),
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
    onSubmit: ({ value }) => {
      // Optimistic instant-close: onMutate patches the row, we close now, and
      // onError/onSettled reconcile in the background. No user-fixable failure
      // (LAST_ADMIN / CANNOT_ACT_ON_SELF aren't fixable here — they only toast).
      updateMutation.mutate({ id: userId, ...value })
      onDone()
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

      <ResponsiveDialogFooter className="mt-6">
        <form.AppForm>
          <form.CancelButton onClick={onDone}>{m.common_cancel()}</form.CancelButton>
          <form.SubmitButton label={m.common_save()} />
        </form.AppForm>
      </ResponsiveDialogFooter>
    </form>
  )
}
