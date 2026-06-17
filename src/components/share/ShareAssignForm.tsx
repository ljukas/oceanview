import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import type { UserOption } from '~/components/form/UserSelectField'
import { useAppForm } from '~/hooks/form'
import { orpc } from '~/lib/orpc/client'
import { optimisticPatch } from '~/lib/orpc/optimistic'
import type { AdminPartRow } from '~/lib/orpc/procedures/share'
import type { ShareCode } from '~/lib/shares/codes'
import { m } from '~/paraglide/messages'

// The share-assignment form. Complex enough (whole/split branch + date + one-or-two
// user selects) to live on a dedicated route rather than an overlay — see ADR-0013.
// Container-agnostic: the route supplies the data + page chrome and an `onDone`
// (navigate back to the grid), called after the optimistic submit and on cancel.

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
        ctx.addIssue({
          code: 'custom',
          path: ['userId'],
          message: m.share_validation_owner_required(),
        })
      }
    } else {
      if (!val.part1UserId) {
        ctx.addIssue({
          code: 'custom',
          path: ['part1UserId'],
          message: m.share_validation_part_owner_required({ part: 1 }),
        })
      }
      if (!val.part2UserId) {
        ctx.addIssue({
          code: 'custom',
          path: ['part2UserId'],
          message: m.share_validation_part_owner_required({ part: 2 }),
        })
      }
    }
  })

type Props = {
  shareCode: ShareCode
  part1: AdminPartRow
  part2: AdminPartRow
  users: ReadonlyArray<UserOption>
  /** Navigate back to the grid — called after an optimistic submit and on cancel. */
  onDone: () => void
}

export function ShareAssignForm({ shareCode, part1, part2, users, onDone }: Props) {
  const queryClient = useQueryClient()
  const owner1Id = part1.currentOwner?.id
  const owner2Id = part2.currentOwner?.id
  const initialMode: 'whole' | 'split' =
    owner1Id && owner2Id && owner1Id !== owner2Id ? 'split' : 'whole'

  // Build the optimistic owner cell from the selected option. UserOption carries
  // no blurhash, so leave it null — the onSettled refetch fills in the real one.
  const ownerFromOption = (userId: string): AdminPartRow['currentOwner'] => {
    const u = users.find((o) => o.id === userId)
    return u ? { id: u.id, name: u.name, image: u.image, imageBlurhash: null } : null
  }

  const assignMutation = useMutation(
    orpc.share.assign.mutationOptions({
      // Paint the new owners into the admin grid before the round-trip. "Current
      // owner" in listAll is the open-ended assignment's owner, so it flips to the
      // new owner regardless of the effective `from` date — this patch is always
      // correct. The owners list (listContacts share badges) reconciles on settle.
      onMutate: (vars) => {
        const owner1 =
          vars.assignment.kind === 'whole'
            ? ownerFromOption(vars.assignment.userId)
            : ownerFromOption(vars.assignment.part1UserId)
        const owner2 =
          vars.assignment.kind === 'whole'
            ? ownerFromOption(vars.assignment.userId)
            : ownerFromOption(vars.assignment.part2UserId)
        return optimisticPatch(
          queryClient,
          orpc.share.listAll.queryKey(),
          (p) => p.id === part1.id || p.id === part2.id,
          (p) => ({ ...p, currentOwner: p.id === part1.id ? owner1 : owner2 }),
        )
      },
      // onError/onSettled live on useMutation (not the mutate call) so they still
      // run after we navigate away below. onSettled re-syncs the grid and owners
      // to the backend's truth (and reverts the optimistic patch on failure).
      onError: (err) => {
        toast.error(err.message || m.share_assign_error())
      },
      onSettled: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.share.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.user.listContacts.key() }),
        ]),
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
    onSubmit: ({ value }) => {
      // Optimistic submit: onMutate paints the new owners, we navigate back now,
      // and onError/onSettled reconcile in the background.
      assignMutation.mutate({
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
      onDone()
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col gap-4"
    >
      <form.AppField
        name="from"
        children={(field) => <field.DateField label={m.share_field_from()} />}
      />
      <form.AppField
        name="mode"
        children={(field) => (
          <field.ToggleField
            label={m.share_field_assignment()}
            options={[
              { value: 'whole', label: m.share_assign_whole() },
              { value: 'split', label: m.share_assign_split() },
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
              children={(field) => (
                <field.UserSelectField label={m.share_field_new_owner()} users={users} />
              )}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <form.AppField
                name="part1UserId"
                children={(field) => (
                  <field.UserSelectField
                    label={m.share_field_part_owner({ part: `${shareCode}1` })}
                    users={users}
                  />
                )}
              />
              <form.AppField
                name="part2UserId"
                children={(field) => (
                  <field.UserSelectField
                    label={m.share_field_part_owner({ part: `${shareCode}2` })}
                    users={users}
                  />
                )}
              />
            </div>
          )
        }
      />

      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <form.AppForm>
          <form.CancelButton onClick={onDone}>{m.common_cancel()}</form.CancelButton>
          <form.SubmitButton
            label={m.share_assign_submit()}
            pendingLabel={m.share_assign_pending()}
          />
        </form.AppForm>
      </div>
    </form>
  )
}
