import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
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
import { FieldGroup } from '~/components/ui/field'
import { Spinner } from '~/components/ui/spinner'
import { useAppForm } from '~/hooks/form'
import { orpc } from '~/lib/orpc/client'
import { SHARE_CODES } from '~/lib/shares/codes'
import { m } from '~/paraglide/messages'

type Props = {
  open: boolean
  year?: number
  onOpenChange: (open: boolean) => void
}

const shareOptions = SHARE_CODES.map((code) => ({ value: code, label: code }))

const editSeasonFormSchema = z.object({
  startWeek: z
    .string()
    .regex(/^\d+$/, { error: () => m.season_validation_week_invalid() })
    .refine((v) => Number(v) >= 1 && Number(v) <= 53, {
      error: () => m.season_validation_week_range(),
    }),
  startShare: z.enum(SHARE_CODES, { error: () => m.season_validation_start_share_required() }),
})

export function EditSeasonDialog({ open, year, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {year !== undefined ? m.season_edit_title_year({ year }) : m.season_edit_title()}
          </DialogTitle>
          <DialogDescription>{m.season_edit_description()}</DialogDescription>
        </DialogHeader>
        {year !== undefined ? (
          <Suspense
            fallback={
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            }
          >
            <EditSeasonDialogBody key={year} year={year} onDone={() => onOpenChange(false)} />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function EditSeasonDialogBody({ year, onDone }: { year: number; onDone: () => void }) {
  const queryClient = useQueryClient()
  const { data: season } = useSuspenseQuery(orpc.season.getByYear.queryOptions({ input: { year } }))

  const updateMutation = useMutation(
    orpc.season.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.season.key() })
        toast.success(m.season_updated())
        onDone()
      },
      onError: (err) => {
        toast.error(err.message || m.season_update_error())
      },
    }),
  )

  const form = useAppForm({
    defaultValues: {
      startWeek: String(season.startWeek),
      startShare: season.startShare as string,
    },
    validators: { onSubmit: editSeasonFormSchema },
    onSubmit: async ({ value }) => {
      await updateMutation.mutateAsync({
        year,
        startWeek: Number(value.startWeek),
        startShare: value.startShare as (typeof SHARE_CODES)[number],
      })
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.AppField
          name="startWeek"
          children={(field) => (
            <field.TextField
              label={m.season_field_start_week()}
              type="number"
              description={m.season_field_start_week_description()}
              inputClassName="tabular-nums"
            />
          )}
        />
        <form.AppField
          name="startShare"
          children={(field) => (
            <field.SelectField
              label={m.season_field_start_share()}
              description={m.season_field_start_share_description()}
              options={shareOptions}
            />
          )}
        />
      </FieldGroup>

      <DialogFooter className="mt-6">
        <form.AppForm>
          <form.CancelButton onClick={onDone}>{m.common_cancel()}</form.CancelButton>
          <form.SubmitButton label={m.common_save()} />
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}
