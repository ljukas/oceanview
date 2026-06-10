import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
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
import { useAppForm } from '~/hooks/form'
import { orpc } from '~/lib/orpc/client'
import { SHARE_CODES } from '~/lib/shares/codes'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const shareOptions = SHARE_CODES.map((code) => ({ value: code, label: code }))

// Form values are strings (TextField stores `string`); we validate the
// string shape here and coerce to numbers in `onSubmit` before calling the
// mutation. Range checks live on the server (createSeasonSchema) too.
const createSeasonFormSchema = z.object({
  year: z
    .string()
    .regex(/^\d+$/, { error: 'Ange ett giltigt år' })
    .refine((v) => Number(v) >= 2020 && Number(v) <= 2100, {
      error: 'År måste vara mellan 2020 och 2100',
    }),
  startWeek: z
    .string()
    .regex(/^\d+$/, { error: 'Ange ett giltigt veckonummer' })
    .refine((v) => Number(v) >= 1 && Number(v) <= 53, {
      error: 'Vecka måste vara mellan 1 och 53',
    }),
  startShare: z.enum(SHARE_CODES, { error: 'Välj en startandel' }),
})

export function CreateSeasonDialog({ open, onOpenChange }: Props) {
  // Only mounted when `open === true`, which is gated by the URL search
  // param `dialog=createSeason` and the route loader has prefetched
  // `suggestedNext`. The suspense read is therefore synchronous.
  if (!open) return null
  return <CreateSeasonDialogInner onOpenChange={onOpenChange} />
}

function CreateSeasonDialogInner({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const { data: defaults } = useSuspenseQuery(orpc.season.suggestedNext.queryOptions())

  const createMutation = useMutation(
    orpc.season.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.season.key() })
        toast.success('Säsongen skapades')
        onOpenChange(false)
      },
      onError: (err) => {
        toast.error(err.message || 'Kunde inte skapa säsongen')
      },
    }),
  )

  const form = useAppForm({
    defaultValues: {
      year: String(defaults.year),
      startWeek: String(defaults.startWeek),
      startShare: defaults.startShare as string,
    },
    validators: { onSubmit: createSeasonFormSchema },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync({
        year: Number(value.year),
        startWeek: Number(value.startWeek),
        startShare: value.startShare as (typeof SHARE_CODES)[number],
      })
    },
  })

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ny säsong</DialogTitle>
          <DialogDescription>
            Förvalda värden är ifyllda. Justera vid behov och spara för att lägga till säsongen i
            Disponeringslistan.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <FieldGroup>
            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-3">
                <form.AppField
                  name="year"
                  children={(field) => (
                    <field.TextField label="År" type="number" inputClassName="tabular-nums" />
                  )}
                />
              </div>
              <div className="col-span-2">
                <form.AppField
                  name="startWeek"
                  children={(field) => (
                    <field.TextField
                      label="Startvecka"
                      type="number"
                      inputClassName="tabular-nums"
                    />
                  )}
                />
              </div>
            </div>
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
              <form.CancelButton onClick={() => onOpenChange(false)}>Avbryt</form.CancelButton>
              <form.SubmitButton label="Skapa säsong" />
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
