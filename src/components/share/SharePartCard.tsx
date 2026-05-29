import { ClockIcon, UserMinusIcon } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import type { AdminPartRow } from '~/lib/orpc/procedures/share'
import { shareBackgroundClass } from '~/lib/shares/colors'
import { cn, initials } from '~/lib/utils'

type Props = {
  shareCode: string
  part1: AdminPartRow
  part2: AdminPartRow
  onAssign: () => void
  onUnassign: () => void
  onHistory: () => void
}

export function SharePartCard({ shareCode, part1, part2, onAssign, onUnassign, onHistory }: Props) {
  const owner1 = part1.currentOwner
  const owner2 = part2.currentOwner
  const isWhole = owner1 && owner2 && owner1.id === owner2.id
  const isUnassigned = !owner1 && !owner2
  const accentClass =
    shareBackgroundClass[shareCode as keyof typeof shareBackgroundClass] ?? 'bg-muted'

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <header
        className={cn(
          'flex items-baseline justify-between gap-2 px-4 py-3 text-foreground',
          accentClass,
        )}
      >
        <span className="font-semibold text-2xl tracking-tight">{shareCode}</span>
        {isWhole ? <Badge variant="secondary">Hel andel</Badge> : null}
        {!isWhole && !isUnassigned ? <Badge variant="secondary">Delad</Badge> : null}
      </header>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {isUnassigned ? (
          <p className="py-4 text-center text-muted-foreground text-sm">Ej tilldelad</p>
        ) : isWhole && owner1 ? (
          <OwnerRow owner={owner1} />
        ) : (
          <div className="flex flex-col gap-2">
            <SplitRow label={`${shareCode}1`} owner={owner1} />
            <SplitRow label={`${shareCode}2`} owner={owner2} />
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t bg-muted/30 px-3 py-2">
        <Button size="sm" variant="default" onClick={onAssign} className="flex-1">
          {isUnassigned ? 'Tilldela' : 'Tilldela om'}
        </Button>
        {!isUnassigned ? (
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Ta bort tilldelning"
            onClick={onUnassign}
          >
            <UserMinusIcon />
          </Button>
        ) : null}
        <Button size="icon-sm" variant="outline" aria-label="Historik" onClick={onHistory}>
          <ClockIcon />
        </Button>
      </footer>
    </article>
  )
}

type Owner = NonNullable<AdminPartRow['currentOwner']>

function OwnerRow({ owner }: { owner: Owner }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-10">
        {owner.image ? (
          <AvatarImage
            src={owner.image}
            alt={owner.name}
            width={40}
            height={40}
            blurhash={owner.imageBlurhash}
          />
        ) : null}
        <AvatarFallback>{initials(owner.name)}</AvatarFallback>
      </Avatar>
      <span className="truncate font-medium">{owner.name}</span>
    </div>
  )
}

function SplitRow({ label, owner }: { label: string; owner: Owner | null }) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-background/60 p-2">
      <span className="w-8 font-mono font-semibold text-muted-foreground text-sm">{label}</span>
      {owner ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar className="size-7">
            {owner.image ? (
              <AvatarImage
                src={owner.image}
                alt={owner.name}
                width={28}
                height={28}
                blurhash={owner.imageBlurhash}
              />
            ) : null}
            <AvatarFallback className="text-xs">{initials(owner.name)}</AvatarFallback>
          </Avatar>
          <span className="truncate text-sm">{owner.name}</span>
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">Ej tilldelad</span>
      )}
    </div>
  )
}
