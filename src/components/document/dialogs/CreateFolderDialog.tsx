import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { useAppForm } from '~/hooks/form'
import { orpc } from '~/lib/orpc/client'
import { m } from '~/paraglide/messages'

const schema = z.object({
  name: z
    .string()
    .min(1, { error: () => m.validation_name_required() })
    .max(255),
})

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentId: string | null
}

export function CreateFolderDialog({ open, onOpenChange, parentId }: Props) {
  const queryClient = useQueryClient()

  const createMutation = useMutation(
    orpc.folder.createFolder.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.folder.key() })
        toast.success(m.folder_created_toast())
        onOpenChange(false)
      },
      onError: (err) => toast.error(err.message || m.folder_create_error()),
    }),
  )

  const form = useAppForm({
    defaultValues: { name: '' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync({ parentId, name: value.name })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.folder_create_title()}</DialogTitle>
          <DialogDescription>{m.folder_create_description()}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.AppField name="name">
            {(field) => (
              <field.TextField label={m.document_name_label()} autoComplete="off" autoFocus />
            )}
          </form.AppField>

          <DialogFooter className="mt-6">
            <form.AppForm>
              <form.CancelButton onClick={() => onOpenChange(false)}>
                {m.common_cancel()}
              </form.CancelButton>
              <form.SubmitButton label={m.folder_create_submit()} />
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
