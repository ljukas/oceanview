import type { ShareCode } from '~/lib/shares/codes'
import { shareBackgroundClass } from '~/lib/shares/colors'
import { cn } from '~/lib/utils'

type WishChipsProps = {
  wishes: Array<ShareCode>
  actingShare: ShareCode | null
}

// Per-block stack of share-letter chips showing who wished for it; the
// acting share's own chip is brand-accented (ADR-0020 §UI). Decorative for
// AT — the block button's aria-pressed/label carries the state. The min-h
// placeholder keeps block heights even across cells without chips.
export function WishChips({ wishes, actingShare }: WishChipsProps) {
  return (
    <span className="flex min-h-4 flex-wrap items-center justify-center gap-0.5" aria-hidden>
      {wishes.map((code) => (
        <span
          key={code}
          className={cn(
            'flex size-4 items-center justify-center rounded-full font-medium text-[10px] leading-none',
            shareBackgroundClass[code],
            code === actingShare && 'ring-1 ring-brand',
          )}
        >
          {code}
        </span>
      ))}
    </span>
  )
}
