import { MailIcon, PhoneIcon, SailboatIcon, StarIcon } from 'lucide-react'
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import type { SharePartRow } from '~/lib/services/share'
import type { UserRow } from '~/lib/services/user'
import type { ShareCode } from '~/lib/shares/codes'
import { shareBackgroundClass } from '~/lib/shares/colors'
import { cn, initials } from '~/lib/utils'

export type ContactRow = UserRow & { shares: Array<SharePartRow> }

type Props = {
  contact: ContactRow
  isSelf: boolean
  isOnline: boolean
}

export function ContactCard({ contact, isSelf, isOnline }: Props) {
  const isAdmin = contact.role === 'admin'

  return (
    <article className="flex w-full flex-col gap-5 rounded-lg border bg-card p-6 sm:w-80">
      <div className="flex items-center gap-4">
        <Avatar className="size-14 shrink-0 shadow-sm">
          {contact.image ? (
            <AvatarImage
              src={contact.image}
              alt={contact.name}
              width={56}
              height={56}
              blurhash={contact.imageBlurhash}
            />
          ) : null}
          <AvatarFallback className="font-medium text-lg">{initials(contact.name)}</AvatarFallback>
          {isOnline && (
            <AvatarBadge className="size-4 bg-success ring-[3px]">
              <span
                aria-hidden
                className="absolute inset-0 animate-ping rounded-full bg-success opacity-75"
              />
              <span className="sr-only">Ansluten</span>
            </AvatarBadge>
          )}
        </Avatar>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <span className="wrap-break-word font-semibold">{contact.name || '—'}</span>
            {isSelf && <Badge variant="secondary">Du</Badge>}
          </div>
          {isAdmin ? (
            <span className="inline-flex items-center gap-1 font-medium text-primary text-sm">
              <StarIcon className="size-3.5 fill-current" aria-hidden="true" />
              Admin
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
              <SailboatIcon className="size-3.5" aria-hidden="true" />
              Seglare
            </span>
          )}
        </div>
      </div>

      <div className={cn('grid w-full gap-2', contact.phone ? 'grid-cols-2' : 'grid-cols-1')}>
        <Button variant="outline" size="sm" asChild>
          <a href={`mailto:${contact.email}`} aria-label={`Skicka e-post till ${contact.name}`}>
            <MailIcon data-icon="inline-start" />
            E-post
          </a>
        </Button>
        {contact.phone && (
          <Button variant="outline" size="sm" asChild>
            <a href={`tel:${contact.phone}`} aria-label={`Ring ${contact.name}`}>
              <PhoneIcon data-icon="inline-start" />
              Ring
            </a>
          </Button>
        )}
      </div>

      {contact.shares.length > 0 && (
        <div className="flex w-full flex-col items-center gap-2 border-t pt-4">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Andelar
          </span>
          <div className="flex flex-wrap justify-center gap-1.5">
            {contact.shares.map((s) => (
              <ShareBadge key={s.id} shareCode={s.shareCode} partNumber={s.partNumber} />
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

function ShareBadge({ shareCode, partNumber }: { shareCode: ShareCode; partNumber: number }) {
  return (
    <Badge
      variant="outline"
      className={cn('border-transparent text-foreground', shareBackgroundClass[shareCode])}
    >
      {shareCode}
      {partNumber}
    </Badge>
  )
}
