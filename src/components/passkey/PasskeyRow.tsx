import { useForm } from '@tanstack/react-form'
import { CheckIcon, KeyRoundIcon, PencilIcon, RotateCcwIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Spinner } from '~/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { type Passkey, useRenamePasskey } from '~/hooks/usePasskeys'
import { getPasskeyProvider } from '~/lib/passkeyProviders'

const renameSchema = z.object({ name: z.string().trim().min(1) })

const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function PasskeyRow({ passkey, onDelete }: { passkey: Passkey; onDelete: () => void }) {
  const renamePasskey = useRenamePasskey()
  const [isEditing, setIsEditing] = useState(false)

  const provider = getPasskeyProvider(passkey.aaguid)
  const customName = passkey.name?.trim()
  const displayName = customName || provider?.name || 'Passkey'
  const showProviderSubtitle = Boolean(customName && provider?.name)
  const isSynced = passkey.backedUp === true || passkey.deviceType === 'multiDevice'

  const createdAt =
    passkey.createdAt instanceof Date
      ? passkey.createdAt
      : passkey.createdAt
        ? new Date(passkey.createdAt)
        : null

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {provider?.iconLight ? (
          <img src={provider.iconLight} alt="" className="size-6 shrink-0 rounded-sm dark:hidden" />
        ) : null}
        {provider?.iconDark ? (
          <img
            src={provider.iconDark}
            alt=""
            className="hidden size-6 shrink-0 rounded-sm dark:block"
          />
        ) : null}
        {!provider ? <KeyRoundIcon className="size-5 shrink-0 text-muted-foreground" /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {isEditing ? (
            <RenamePasskeyForm passkey={passkey} onDone={() => setIsEditing(false)} />
          ) : (
            <span className="break-all font-medium text-sm">{displayName}</span>
          )}
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
            {showProviderSubtitle ? <span>{provider?.name}</span> : null}
            <span>{isSynced ? 'Synkad' : 'Endast denna enhet'}</span>
            {createdAt ? <span>Tillagd {dateFormatter.format(createdAt)}</span> : null}
          </span>
        </div>
      </div>
      {isEditing ? null : (
        <div className="flex gap-2 self-end sm:self-auto">
          {customName ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Återställ namn"
                  onClick={() => renamePasskey.mutate({ id: passkey.id, name: '' })}
                  disabled={renamePasskey.isPending}
                >
                  {renamePasskey.isPending ? <Spinner /> : <RotateCcwIcon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Återställ namn</TooltipContent>
            </Tooltip>
          ) : null}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Byt namn"
            onClick={() => setIsEditing(true)}
          >
            <PencilIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Ta bort"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2Icon />
          </Button>
        </div>
      )}
    </li>
  )
}

function RenamePasskeyForm({ passkey, onDone }: { passkey: Passkey; onDone: () => void }) {
  const renamePasskey = useRenamePasskey()
  const form = useForm({
    defaultValues: { name: passkey.name ?? '' },
    validators: { onSubmit: renameSchema },
    onSubmit: async ({ value }) => {
      const trimmed = value.name.trim()
      if (trimmed === passkey.name) {
        onDone()
        return
      }
      renamePasskey.mutate({ id: passkey.id, name: trimmed }, { onSuccess: onDone })
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <div className="flex items-start gap-2">
          <form.Field
            name="name"
            children={(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid} className="flex-1">
                  <FieldLabel htmlFor={field.name} className="sr-only">
                    Namn på passkey
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') onDone()
                    }}
                    disabled={form.state.isSubmitting}
                    aria-invalid={isInvalid}
                    autoFocus
                    className="h-8"
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting] as const}
            children={([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                aria-label="Spara"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? <Spinner /> : <CheckIcon />}
              </Button>
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Avbryt"
            onClick={onDone}
            disabled={form.state.isSubmitting}
          >
            <XIcon />
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
