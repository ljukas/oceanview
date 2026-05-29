import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet'
import { Skeleton } from '~/components/ui/skeleton'
import { orpc } from '~/lib/orpc/client'
import type { AdminHistoryEvent } from '~/lib/orpc/procedures/share'
import type { ShareCode } from '~/lib/shares/codes'
import { initials } from '~/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  shareCode: ShareCode | undefined
}

const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function AssignmentHistorySheet({ open, onOpenChange, shareCode }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Historik för andel {shareCode ?? ''}</SheetTitle>
          <SheetDescription>Alla tidigare tilldelningar för andelen, nyast först.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          {shareCode ? (
            <Suspense fallback={<HistoryFallback />}>
              <HistoryBody shareCode={shareCode} key={shareCode} />
            </Suspense>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function HistoryFallback() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-14 w-full rounded-md" />
      <Skeleton className="h-14 w-full rounded-md" />
      <Skeleton className="h-14 w-full rounded-md" />
    </div>
  )
}

function HistoryBody({ shareCode }: { shareCode: ShareCode }) {
  const { data: history } = useSuspenseQuery(
    orpc.share.listHistory.queryOptions({ input: { shareCode } }),
  )

  if (history.length === 0) {
    return <p className="py-8 text-center text-muted-foreground text-sm">Ingen historik än.</p>
  }

  return (
    <ol className="flex flex-col gap-3">
      {history.map((event) => (
        <HistoryEntry key={event.eventId} event={event} />
      ))}
    </ol>
  )
}

function HistoryEntry({ event }: { event: AdminHistoryEvent }) {
  const dateRange = (
    <span className="text-muted-foreground text-xs tabular-nums">
      {dateFormatter.format(event.assignedFrom)} →{' '}
      {event.assignedTo ? dateFormatter.format(event.assignedTo) : 'vidare'}
    </span>
  )

  if (event.kind === 'split') {
    return (
      <li className="flex flex-col gap-2 rounded-md border bg-card p-3">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs">
            Delad
          </Badge>
          {event.isActive ? <Badge variant="secondary">Aktiv</Badge> : null}
        </div>
        {event.children.map((child) => (
          <ChildRow key={child.partId} child={child} dense />
        ))}
        {dateRange}
      </li>
    )
  }

  // whole or partial — single user row
  const child = event.children[0]
  const label = event.kind === 'whole' ? event.shareCode : child.partId

  return (
    <li className="flex items-center gap-3 rounded-md border bg-card p-3">
      <Avatar className="size-9">
        {child.user?.image ? (
          <AvatarImage
            src={child.user.image}
            alt={child.user.name}
            width={36}
            height={36}
            blurhash={child.user.imageBlurhash ?? undefined}
          />
        ) : null}
        <AvatarFallback>{initials(child.user?.name ?? '?')}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-sm">{child.user?.name ?? 'Okänd'}</span>
          <Badge variant="outline" className="font-mono text-xs">
            {label}
          </Badge>
          {event.isActive ? <Badge variant="secondary">Aktiv</Badge> : null}
        </div>
        {dateRange}
      </div>
    </li>
  )
}

function ChildRow({
  child,
  dense,
}: {
  child: AdminHistoryEvent['children'][number]
  dense?: boolean
}) {
  const size = dense ? 'size-7' : 'size-9'
  const labelClass = dense ? 'text-xs' : 'text-sm'
  return (
    <div className="flex items-center gap-2">
      <Avatar className={size}>
        {child.user?.image ? (
          <AvatarImage
            src={child.user.image}
            alt={child.user.name}
            width={dense ? 28 : 36}
            height={dense ? 28 : 36}
            blurhash={child.user.imageBlurhash ?? undefined}
          />
        ) : null}
        <AvatarFallback className={dense ? 'text-xs' : undefined}>
          {initials(child.user?.name ?? '?')}
        </AvatarFallback>
      </Avatar>
      <span className={`truncate ${labelClass}`}>{child.user?.name ?? 'Okänd'}</span>
      <Badge variant="outline" className="ml-auto font-mono text-xs">
        {child.partId}
      </Badge>
    </div>
  )
}
