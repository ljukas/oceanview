import { isDefinedError } from '@orpc/client'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { FieldGroup } from '~/components/ui/field'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '~/components/ui/responsive-dialog'
import { useAppForm } from '~/hooks/form'
import { orpc } from '~/lib/orpc/client'
import { seasonErrorMessage } from '~/lib/orpc/seasonErrorMessage'
import { SHARE_CODES } from '~/lib/shares/codes'
import { m } from '~/paraglide/messages'

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
    .regex(/^\d+$/, { error: () => m.season_validation_year_invalid() })
    .refine((v) => Number(v) >= 2020 && Number(v) <= 2100, {
      error: () => m.season_validation_year_range(),
    }),
  startWeek: z
    .string()
    .regex(/^\d+$/, { error: () => m.season_validation_week_invalid() })
    .refine((v) => Number(v) >= 1 && Number(v) <= 53, {
      error: () => m.season_validation_week_range(),
    }),
  startShare: z.enum(SHARE_CODES, { error: () => m.season_validation_start_share_required() }),
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
        toast.success(m.season_created())
        onOpenChange(false)
      },
      onError: (err) => {
        toast.error(isDefinedError(err) ? seasonErrorMessage(err.code) : m.season_create_error())
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
    <ResponsiveDialog open onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{m.season_create_title()}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{m.season_create_description()}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
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
                    <field.TextField
                      label={m.season_field_year()}
                      type="number"
                      inputClassName="tabular-nums"
                    />
                  )}
                />
              </div>
              <div className="col-span-2">
                <form.AppField
                  name="startWeek"
                  children={(field) => (
                    <field.TextField
                      label={m.season_field_start_week()}
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
                  label={m.season_field_start_share()}
                  description={m.season_field_start_share_description()}
                  options={shareOptions}
                />
              )}
            />
          </FieldGroup>

          <ResponsiveDialogFooter className="mt-6">
            <form.AppForm>
              <form.CancelButton onClick={() => onOpenChange(false)}>
                {m.common_cancel()}
              </form.CancelButton>
              <form.SubmitButton label={m.season_create_submit()} />
            </form.AppForm>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
