import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import type { UserOption } from '~/components/form/UserSelectField'
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
  users: ReadonlyArray<UserOption>
}

function todayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

const schema = z
  .object({
    from: z.date(),
    mode: z.enum(['whole', 'split']),
    userId: z.string(),
    part1UserId: z.string(),
    part2UserId: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'whole') {
      if (!val.userId) {
        ctx.addIssue({ code: 'custom', path: ['userId'], message: 'Välj ägare' })
      }
    } else {
      if (!val.part1UserId) {
        ctx.addIssue({ code: 'custom', path: ['part1UserId'], message: 'Välj ägare för part 1' })
      }
      if (!val.part2UserId) {
        ctx.addIssue({ code: 'custom', path: ['part2UserId'], message: 'Välj ägare för part 2' })
      }
    }
  })

export function AssignShareDialog({ open, onOpenChange, shareCode, part1, part2, users }: Props) {
  if (!shareCode || !part1 || !part2) return null
  return (
    <AssignShareDialogBody
      open={open}
      onOpenChange={onOpenChange}
      shareCode={shareCode}
      part1={part1}
      part2={part2}
      users={users}
      key={shareCode}
    />
  )
}

function AssignShareDialogBody({
  open,
  onOpenChange,
  shareCode,
  part1,
  part2,
  users,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shareCode: ShareCode
  part1: AdminPartRow
  part2: AdminPartRow
  users: ReadonlyArray<UserOption>
}) {
  const queryClient = useQueryClient()
  const owner1Id = part1.currentOwner?.id
  const owner2Id = part2.currentOwner?.id
  const initialMode: 'whole' | 'split' =
    owner1Id && owner2Id && owner1Id !== owner2Id ? 'split' : 'whole'

  const assignMutation = useMutation(
    orpc.share.assign.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.share.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.user.listContacts.key() }),
        ])
        toast.success('Andelen tilldelades')
        onOpenChange(false)
      },
      onError: (err) => {
        toast.error(err.message || 'Kunde inte tilldela andelen')
      },
    }),
  )

  const form = useAppForm({
    defaultValues: {
      from: todayUtc(),
      mode: initialMode,
      userId: initialMode === 'whole' ? (owner1Id ?? owner2Id ?? '') : '',
      part1UserId: owner1Id ?? '',
      part2UserId: owner2Id ?? '',
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await assignMutation.mutateAsync({
        shareCode,
        from: value.from,
        assignment:
          value.mode === 'whole'
            ? { kind: 'whole', userId: value.userId }
            : {
                kind: 'split',
                part1UserId: value.part1UserId,
                part2UserId: value.part2UserId,
              },
      })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tilldela andel {shareCode}</DialogTitle>
          <DialogDescription>
            Tilldelas som hel andel. Slå på "Dela upp" för att tilldela halvorna till olika ägare.
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
            name="from"
            children={(field) => <field.DateField label="Gäller från" />}
          />
          <form.AppField
            name="mode"
            children={(field) => (
              <field.ToggleField
                label="Tilldelning"
                options={[
                  { value: 'whole', label: 'Hel andel' },
                  { value: 'split', label: 'Dela upp' },
                ]}
              />
            )}
          />
          <form.Subscribe
            selector={(s) => s.values.mode}
            children={(mode) =>
              mode === 'whole' ? (
                <form.AppField
                  name="userId"
                  children={(field) => <field.UserSelectField label="Ny ägare" users={users} />}
                />
              ) : (
                <div className="flex flex-col gap-4">
                  <form.AppField
                    name="part1UserId"
                    children={(field) => (
                      <field.UserSelectField label={`Ägare av ${shareCode}1`} users={users} />
                    )}
                  />
                  <form.AppField
                    name="part2UserId"
                    children={(field) => (
                      <field.UserSelectField label={`Ägare av ${shareCode}2`} users={users} />
                    )}
                  />
                </div>
              )
            }
          />

          <DialogFooter className="mt-2">
            <form.AppForm>
              <form.CancelButton onClick={() => onOpenChange(false)}>Avbryt</form.CancelButton>
              <form.SubmitButton label="Tilldela" pendingLabel="Tilldelar…" />
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
