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

const schema = z.object({ name: z.string().min(1, 'Ange ett namn').max(255) })

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
        toast.success('Mappen skapades')
        onOpenChange(false)
      },
      onError: (err) => toast.error(err.message || 'Kunde inte skapa mappen'),
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
          <DialogTitle>Ny mapp</DialogTitle>
          <DialogDescription>Skapa en mapp här för att organisera dokument.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <form.AppField name="name">
            {(field) => <field.TextField label="Namn" autoComplete="off" autoFocus />}
          </form.AppField>

          <DialogFooter className="mt-6">
            <form.AppForm>
              <form.CancelButton onClick={() => onOpenChange(false)}>Avbryt</form.CancelButton>
              <form.SubmitButton label="Skapa mapp" />
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
