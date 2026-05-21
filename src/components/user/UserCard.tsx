import { PencilIcon, RotateCcwIcon, SailboatIcon, StarIcon, Trash2Icon } from 'lucide-react'
import { formatPhoneNumberIntl } from 'react-phone-number-input'
import { Button } from '~/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import type { UserRow } from '~/lib/services/user'

type Props = {
  user: UserRow
  isSelf: boolean
  showDeleted: boolean
  onEdit: () => void
  onDelete: () => void
  onRestore: () => void
}

const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function UserCard({ user, isSelf, showDeleted, onEdit, onDelete, onRestore }: Props) {
  const isAdmin = user.role === 'admin'

  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="flex items-stretch justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="break-words font-medium">{user.name || '—'}</span>
          <span className="break-all text-muted-foreground text-sm">{user.email}</span>
          <span className="text-muted-foreground text-sm tabular-nums">
            {showDeleted
              ? user.deletedAt
                ? `Borttagen ${dateFormatter.format(user.deletedAt)}`
                : '—'
              : user.phone
                ? formatPhoneNumberIntl(user.phone) || user.phone
                : '—'}
          </span>
        </div>

        <div className="flex shrink-0 flex-col items-end justify-between gap-3">
          {isAdmin ? (
            <span className="inline-flex items-center gap-1 font-medium text-primary text-sm">
              <StarIcon className="size-3.5 fill-current" />
              Admin
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
              <SailboatIcon className="size-3.5" />
              Seglare
            </span>
          )}

          <div className="flex gap-2">
            {showDeleted ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Återställ"
                    onClick={onRestore}
                  >
                    <RotateCcwIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Återställ</TooltipContent>
              </Tooltip>
            ) : (
              <>
                <Button variant="outline" size="icon-sm" aria-label="Redigera" onClick={onEdit}>
                  <PencilIcon />
                </Button>
                {isSelf ? null : (
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Ta bort"
                    className="text-destructive hover:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
