import type { ComponentProps } from 'react'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { useFormContext } from '~/hooks/form'

type Props = {
  label: string
  pendingLabel?: string
  className?: string
  variant?: ComponentProps<typeof Button>['variant']
}

export function SubmitButton({ label, pendingLabel, className, variant }: Props) {
  const form = useFormContext()

  return (
    <form.Subscribe
      selector={(state) => [state.canSubmit, state.isSubmitting] as const}
      children={([canSubmit, isSubmitting]) => (
        <Button
          type="submit"
          variant={variant}
          className={className}
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          {isSubmitting && pendingLabel ? pendingLabel : label}
        </Button>
      )}
    />
  )
}
