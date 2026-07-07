import { MONTH_LABELS, OWNED_RING } from '~/components/season/calendar'
import type { MonthBand } from '~/lib/services/season/logic'
import type { ShareCode } from '~/lib/shares/codes'
import { shareBackgroundClass } from '~/lib/shares/colors'
import { cn } from '~/lib/utils'
import { blockAriaLabel, type StripBlock } from './stripModel'
import { WishChips } from './WishChips'

type BookingCardsProps = {
  year: number
  monthBands: Array<MonthBand>
  blocks: Array<StripBlock>
  actingShare: ShareCode | null
  showWishes: boolean
  interactive: boolean
  onBlockClick: (block: StripBlock) => void
  selectedWeek: number | null
}

export function BookingCards({
  year,
  monthBands,
  blocks,
  actingShare,
  showWishes,
  interactive,
  onBlockClick,
  selectedWeek,
}: BookingCardsProps) {
  return (
    <article className="overflow-hidden rounded-lg border bg-surface-raised lg:hidden">
      <header className="flex items-center gap-2 border-b bg-muted px-4 py-2">
        <span className="font-semibold tabular-nums">{year}</span>
      </header>
      <div className="flex flex-col">
        {monthBands.map((band) => {
          const bandBlocks = blocks.filter(
            (b) => b.firstWeek >= band.firstWeek && b.firstWeek <= band.lastWeek,
          )
          // Blocks belong to the month of their first week; a tail-only band
          // renders nothing (Disponeringslista convention).
          if (bandBlocks.length === 0) return null
          return (
            <section key={band.firstWeek} className="border-b last:border-b-0">
              <h3 className="bg-muted/50 px-4 py-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                {MONTH_LABELS[band.month]?.()}
              </h3>
              <div className="flex flex-col">
                {bandBlocks.map((block, i) => {
                  const ownTarget = actingShare !== null && block.target.targetShare === actingShare
                  const disabled = !interactive || ownTarget
                  return (
                    <button
                      key={block.firstWeek}
                      type="button"
                      disabled={disabled}
                      aria-pressed={showWishes ? block.myWish : undefined}
                      aria-label={blockAriaLabel(block, { showWishes, actingShare })}
                      onClick={() => onBlockClick(block)}
                      className={cn(
                        'flex items-center justify-between gap-2 px-4 py-2 text-left',
                        'transition-[background-color,box-shadow] duration-150 ease-out motion-reduce:transition-none',
                        i > 0 && 'border-t',
                        block.holder && shareBackgroundClass[block.holder],
                        block.isMine && OWNED_RING,
                        !block.isMine && block.myWish && 'ring-2 ring-brand ring-inset',
                        selectedWeek === block.firstWeek && 'ring-2 ring-brand ring-inset',
                      )}
                    >
                      <span className="text-muted-foreground tabular-nums">
                        {block.firstWeek}–{block.lastWeek}
                      </span>
                      {showWishes && <WishChips wishes={block.wishes} actingShare={actingShare} />}
                      <span
                        className={cn(
                          'font-semibold',
                          block.holder && !block.holderAssigned && 'opacity-50',
                        )}
                      >
                        {block.holder ?? '–'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </article>
  )
}
