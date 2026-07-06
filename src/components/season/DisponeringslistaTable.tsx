import { StarIcon } from 'lucide-react'
import type { ShareCode } from '~/lib/shares/codes'
import { shareBackgroundClass } from '~/lib/shares/colors'
import { cn } from '~/lib/utils'
import { m } from '~/paraglide/messages'

export type MonthBand = {
  month: number
  firstWeek: number
  lastWeek: number
  span: number
}

export type Cell = {
  week: number
  shareCode: ShareCode
  month: number
}

export type ShareBlock = {
  firstWeek: number
  lastWeek: number
  shareCode: ShareCode
  span: number
}

export type YearSchedule = {
  year: number
  cells: Array<Cell>
  blocks: Array<ShareBlock>
  monthBands: Array<MonthBand>
}

type Props = {
  schedules: Array<YearSchedule>
  ownedShareCodes: ReadonlySet<ShareCode>
}

// Short month labels indexed 0..11 (Jan..Dec). The season only touches
// positions 4..9 (May..Oct) in practice, but the array keeps the lookup
// branchless. Message FUNCTIONS, called at render so the labels follow the
// active locale (precedent: AppSidebar nav items).
const MONTH_LABELS = [
  m.season_month_jan,
  m.season_month_feb,
  m.season_month_mar,
  m.season_month_apr,
  m.season_month_may,
  m.season_month_jun,
  m.season_month_jul,
  m.season_month_aug,
  m.season_month_sep,
  m.season_month_oct,
  m.season_month_nov,
  m.season_month_dec,
] as const

// Owned-cell highlight: 2px inset ring drawn inside the cell box so it
// never collides with the table's month-divider `border-r` or the
// year-block's heavy `border-t-2`. `--foreground` is the semantic
// contrast token against both the light share-pastel backgrounds
// (current-year cells) and the card background (other-year cells).
const OWNED_RING = 'ring-2 ring-inset ring-foreground'

export function DisponeringslistaTable({ schedules, ownedShareCodes }: Props) {
  const currentYear = new Date().getFullYear()

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <h2 className="text-center font-heading font-semibold text-lg tracking-tight">
        {m.season_disponeringslista_title()}
      </h2>
      <WideLayout
        schedules={schedules}
        ownedShareCodes={ownedShareCodes}
        currentYear={currentYear}
      />
      <MobileLayout
        schedules={schedules}
        ownedShareCodes={ownedShareCodes}
        currentYear={currentYear}
      />
    </section>
  )
}

type LayoutProps = Props & { currentYear: number }

function WideLayout({ schedules, ownedShareCodes, currentYear }: LayoutProps) {
  return (
    <div className="hidden min-h-0 overflow-auto rounded-lg border bg-surface-raised lg:-mx-4 lg:block">
      <table className="w-full text-sm">
        <tbody>
          {schedules.map((s, yearIdx) => {
            const isCurrent = s.year === currentYear
            // Weeks where a band ends (right border on the data + headers).
            const monthEndWeeks = new Set(s.monthBands.slice(0, -1).map((b) => b.lastWeek))
            const isFirstYear = yearIdx === 0

            return (
              <YearBlock
                key={s.year}
                schedule={s}
                isCurrent={isCurrent}
                isFirstYear={isFirstYear}
                monthEndWeeks={monthEndWeeks}
                ownedShareCodes={ownedShareCodes}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type YearBlockProps = {
  schedule: YearSchedule
  isCurrent: boolean
  isFirstYear: boolean
  monthEndWeeks: Set<number>
  ownedShareCodes: ReadonlySet<ShareCode>
}

function YearBlock({
  schedule: s,
  isCurrent,
  isFirstYear,
  monthEndWeeks,
  ownedShareCodes,
}: YearBlockProps) {
  const lastBandIdx = s.monthBands.length - 1
  // First row of every year (except the very first) gets the heavy top border
  // that separates one year-block from the next.
  const yearTop = isFirstYear ? '' : 'border-t-2 border-border'

  return (
    <>
      <tr className={cn('text-muted-foreground text-xs uppercase tracking-wider', yearTop)}>
        <th
          rowSpan={3}
          className={cn(
            'w-[1%] whitespace-nowrap border-r bg-muted px-2 text-left font-semibold text-foreground text-sm tabular-nums',
          )}
        >
          {s.year}
        </th>
        {s.monthBands.map((band, i) => (
          <th
            key={band.firstWeek}
            colSpan={band.span}
            className={cn('bg-muted py-1 text-center font-semibold', i < lastBandIdx && 'border-r')}
          >
            {MONTH_LABELS[band.month]?.()}
          </th>
        ))}
      </tr>
      <tr className="text-muted-foreground text-xs">
        {s.cells.map((cell) => (
          <td
            key={cell.week}
            className={cn(
              'border-b bg-muted px-1 py-0.5 text-center font-normal tabular-nums',
              monthEndWeeks.has(cell.week) && 'border-r',
            )}
          >
            {cell.week}
          </td>
        ))}
      </tr>
      <tr>
        {s.blocks.map((block) => {
          const isMine = ownedShareCodes.has(block.shareCode)
          return (
            <td
              key={block.firstWeek}
              colSpan={block.span}
              aria-label={
                isMine
                  ? m.season_my_weeks({ from: block.firstWeek, to: block.lastWeek })
                  : undefined
              }
              className={cn(
                'relative px-1 py-2 text-center font-medium',
                monthEndWeeks.has(block.lastWeek) && 'border-r',
                isCurrent
                  ? cn(shareBackgroundClass[block.shareCode], 'font-bold text-foreground')
                  : 'text-muted-foreground',
                isMine && OWNED_RING,
              )}
            >
              {block.shareCode}
            </td>
          )
        })}
      </tr>
    </>
  )
}

function MobileLayout({ schedules, ownedShareCodes, currentYear }: LayoutProps) {
  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-auto lg:hidden">
      {schedules.map((s) => (
        <YearCard
          key={s.year}
          schedule={s}
          isCurrent={s.year === currentYear}
          ownedShareCodes={ownedShareCodes}
        />
      ))}
    </div>
  )
}

type YearCardProps = {
  schedule: YearSchedule
  isCurrent: boolean
  ownedShareCodes: ReadonlySet<ShareCode>
}

function YearCard({ schedule, isCurrent, ownedShareCodes }: YearCardProps) {
  return (
    <article
      className={cn(
        'overflow-hidden rounded-lg border bg-surface-raised',
        isCurrent && 'ring-1 ring-primary/30',
      )}
    >
      <header className="flex items-center gap-2 border-b bg-muted px-4 py-2">
        {isCurrent && <StarIcon className="size-4 text-primary" aria-hidden />}
        <span className="font-semibold tabular-nums">{schedule.year}</span>
      </header>
      <div className="flex flex-col">
        {schedule.monthBands.map((band) => {
          const cells = schedule.cells.filter(
            (c) => c.week >= band.firstWeek && c.week <= band.lastWeek,
          )
          return (
            <MonthSection
              key={band.firstWeek}
              band={band}
              cells={cells}
              isCurrent={isCurrent}
              ownedShareCodes={ownedShareCodes}
            />
          )
        })}
      </div>
    </article>
  )
}

type MonthSectionProps = {
  band: { month: number; firstWeek: number; lastWeek: number; span: number }
  cells: Array<Cell>
  isCurrent: boolean
  ownedShareCodes: ReadonlySet<ShareCode>
}

function MonthSection({ band, cells, isCurrent, ownedShareCodes }: MonthSectionProps) {
  // Months with an odd number of weeks (e.g. 1-week Okt, 5-week Jul/Sep)
  // would leave the last grid row half-empty, breaking the continuous
  // vertical and horizontal dividers. Render an aria-hidden placeholder in
  // that empty slot so the inner border lines run unbroken across the grid.
  const needsPlaceholder = cells.length % 2 === 1
  return (
    <section className="border-b last:border-b-0">
      <h3 className="bg-muted/50 px-4 py-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
        {MONTH_LABELS[band.month]?.()}
      </h3>
      <div className="grid grid-cols-2">
        {cells.map((cell, i) => {
          const isMine = ownedShareCodes.has(cell.shareCode)
          return (
            <div
              key={cell.week}
              className={cn(
                'flex items-center justify-between gap-2 px-4 py-2',
                // Inner cell separators — every left-column cell carries the
                // vertical divider to the right; rows past the first carry the
                // horizontal divider on top.
                i % 2 === 0 && 'border-r',
                i >= 2 && 'border-t',
                isCurrent && shareBackgroundClass[cell.shareCode],
                isMine && OWNED_RING,
              )}
            >
              {isMine && <span className="sr-only">{m.season_my_week_prefix()} </span>}
              <span
                className={cn(
                  'tabular-nums',
                  isCurrent ? 'text-foreground/80' : 'text-muted-foreground',
                )}
              >
                {cell.week}
              </span>
              <span
                className={cn(
                  'font-semibold',
                  isCurrent ? 'font-bold text-foreground' : 'text-muted-foreground',
                )}
              >
                {cell.shareCode}
              </span>
            </div>
          )
        })}
        {needsPlaceholder && <div className={cn(cells.length >= 3 && 'border-t')} aria-hidden />}
      </div>
    </section>
  )
}
