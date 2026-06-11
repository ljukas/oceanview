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
import { optimisticPatch } from '~/lib/orpc/optimistic'
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
  document: { id: string; name: string; extension: string | null; folderId: string | null }
}

export function RenameDocumentDialog({ open, onOpenChange, document }: Props) {
  const queryClient = useQueryClient()

  const renameMutation = useMutation(
    orpc.document.renameDocument.mutationOptions({
      // Patch the new name into the row's scoped list cache before the round-trip.
      onMutate: ({ name }) =>
        optimisticPatch(
          queryClient,
          orpc.document.listDocuments.queryKey({ input: { folderId: document.folderId } }),
          (d) => d.id === document.id,
          (d) => ({ ...d, name }),
        ),
      onSuccess: () => {
        toast.success(m.document_renamed_toast())
        onOpenChange(false)
      },
      onError: (err) => toast.error(err.message || m.document_rename_error()),
      onSettled: () =>
        queryClient.invalidateQueries({ queryKey: orpc.document.listDocuments.key() }),
    }),
  )

  const form = useAppForm({
    defaultValues: { name: document.name },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await renameMutation.mutateAsync({ id: document.id, name: value.name })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.document_rename_title()}</DialogTitle>
          <DialogDescription>
            {document.extension
              ? m.document_rename_description_extension()
              : m.document_rename_description()}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                label={m.document_name_label()}
                autoComplete="off"
                autoFocus
                suffix={document.extension ? `.${document.extension}` : undefined}
              />
            )}
          </form.AppField>

          <DialogFooter className="mt-6">
            <form.AppForm>
              <form.CancelButton onClick={() => onOpenChange(false)}>
                {m.common_cancel()}
              </form.CancelButton>
              <form.SubmitButton label={m.common_save()} />
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
