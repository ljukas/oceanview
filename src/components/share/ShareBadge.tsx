import { Badge } from '~/components/ui/badge'
import type { ShareBadgeKind } from '~/lib/shares/collapse'
import { shareBackgroundClass } from '~/lib/shares/colors'
import { cn } from '~/lib/utils'

type Props = {
  badge: ShareBadgeKind
  className?: string
}

export function ShareBadge({ badge, className }: Props) {
  const label = badge.kind === 'whole' ? badge.shareCode : `${badge.shareCode}${badge.partNumber}`
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent text-foreground',
        shareBackgroundClass[badge.shareCode],
        className,
      )}
    >
      {label}
    </Badge>
  )
}
