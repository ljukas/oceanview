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

type Props = {
  open: boolean
  year?: number
  onOpenChange: (open: boolean) => void
}

const shareOptions = SHARE_CODES.map((code) => ({ value: code, label: code }))

const editSeasonFormSchema = z.object({
  startWeek: z
    .string()
    .regex(/^\d+$/, { error: 'Ange ett giltigt veckonummer' })
    .refine((v) => Number(v) >= 1 && Number(v) <= 53, {
      error: 'Vecka måste vara mellan 1 och 53',
    }),
  startShare: z.enum(SHARE_CODES, { error: 'Välj en startandel' }),
})

export function EditSeasonDialog({ open, year, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {year !== undefined ? `Redigera säsong ${year}` : 'Redigera säsong'}
          </DialogTitle>
          <DialogDescription>Justera startvecka och startandel.</DialogDescription>
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
        toast.success('Säsongen uppdaterades')
        onDone()
      },
      onError: (err) => {
        toast.error(err.message || 'Kunde inte uppdatera säsongen')
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
              label="Startvecka"
              type="number"
              description="ISO-veckonummer för säsongens första vecka."
              inputClassName="tabular-nums"
            />
          )}
        />
        <form.AppField
          name="startShare"
          children={(field) => (
            <field.SelectField
              label="Startandel"
              description="Andelen som äger säsongens första vecka."
              options={shareOptions}
            />
          )}
        />
      </FieldGroup>

      <DialogFooter className="mt-6">
        <form.AppForm>
          <form.CancelButton onClick={onDone}>Avbryt</form.CancelButton>
          <form.SubmitButton label="Spara" />
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}
