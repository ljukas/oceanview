import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { useAppForm } from '~/hooks/form'
import { orpc } from '~/lib/orpc/client'

const schema = z.object({ name: z.string().min(1, 'Ange ett namn').max(255) })

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: { id: string; name: string; extension: string | null }
}

export function RenameDocumentDialog({ open, onOpenChange, document }: Props) {
  const queryClient = useQueryClient()

  const renameMutation = useMutation(
    orpc.document.renameDocument.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.document.key() })
        toast.success('Dokumentet bytte namn')
        onOpenChange(false)
      },
      onError: (err) => toast.error(err.message || 'Kunde inte byta namn'),
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
          <DialogTitle>Byt namn på dokument</DialogTitle>
          <DialogDescription>
            {document.extension
              ? 'Ändra namnet. Filändelsen kan inte ändras.'
              : 'Ändra det visade filnamnet.'}
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
                label="Namn"
                autoComplete="off"
                autoFocus
                suffix={document.extension ? `.${document.extension}` : undefined}
              />
            )}
          </form.AppField>

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
              <form.SubmitButton label="Spara" />
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
