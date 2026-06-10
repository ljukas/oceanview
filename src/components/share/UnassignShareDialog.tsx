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
import type { AdminPartRow } from '~/lib/orpc/procedures/share'
import type { ShareCode } from '~/lib/shares/codes'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  shareCode: ShareCode | undefined
  part1: AdminPartRow | undefined
  part2: AdminPartRow | undefined
}

function todayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

const schema = z.object({
  on: z.date(),
  parts: z.enum(['both', '1', '2']),
})

export function UnassignShareDialog({ open, onOpenChange, shareCode, part1, part2 }: Props) {
  if (!shareCode || !part1 || !part2) return null
  return (
    <UnassignShareDialogBody
      key={shareCode}
      open={open}
      onOpenChange={onOpenChange}
      shareCode={shareCode}
      part1={part1}
      part2={part2}
    />
  )
}

function UnassignShareDialogBody({
  open,
  onOpenChange,
  shareCode,
  part1,
  part2,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shareCode: ShareCode
  part1: AdminPartRow
  part2: AdminPartRow
}) {
  const queryClient = useQueryClient()
  const has1 = !!part1.currentOwner
  const has2 = !!part2.currentOwner
  const defaultParts: 'both' | '1' | '2' = has1 && has2 ? 'both' : has1 ? '1' : '2'

  const unassignMutation = useMutation(
    orpc.share.unassign.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.share.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.user.listContacts.key() }),
        ])
        toast.success('Tilldelningen togs bort')
        onOpenChange(false)
      },
      onError: (err) => {
        toast.error(err.message || 'Kunde inte ta bort tilldelningen')
      },
    }),
  )

  const form = useAppForm({
    defaultValues: { on: todayUtc(), parts: defaultParts },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await unassignMutation.mutateAsync({
        shareCode,
        on: value.on,
        parts: value.parts,
      })
    },
  })

  const partsOptions = [
    ...(has1 && has2 ? [{ value: 'both', label: 'Båda' }] : []),
    ...(has1 ? [{ value: '1', label: `${shareCode}1` }] : []),
    ...(has2 ? [{ value: '2', label: `${shareCode}2` }] : []),
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ta bort tilldelning för {shareCode}</DialogTitle>
          <DialogDescription>
            Stänger den valda tilldelningen från och med det valda datumet. Historiken bevaras.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <form.AppField
            name="parts"
            children={(field) => (
              <field.ToggleField label="Vad ska tas bort" options={partsOptions} />
            )}
          />
          <form.AppField name="on" children={(field) => <field.DateField label="Gäller från" />} />
          <DialogFooter className="mt-2">
            <form.AppForm>
              <form.CancelButton onClick={() => onOpenChange(false)}>Avbryt</form.CancelButton>
              <form.SubmitButton label="Ta bort" pendingLabel="Tar bort…" />
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
