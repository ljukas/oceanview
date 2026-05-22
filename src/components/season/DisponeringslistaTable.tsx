import { PencilIcon, StarIcon, Trash2Icon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import type { ShareCode } from '~/lib/shares/codes'
import { shareBackgroundClass, shareRingClass } from '~/lib/shares/colors'
import { cn } from '~/lib/utils'

export type MonthBand = {
  month: number
  firstWeek: number
  lastWeek: number
  span: number
}

export type Cell = {
  week: number
  shareCode: ShareCode
  partId: string
  month: number
}

export type YearSchedule = {
  year: number
  startWeek: number
  cells: Array<Cell>
  monthBands: Array<MonthBand>
}

type Props = {
  schedules: Array<YearSchedule>
  ownedPartIds: ReadonlySet<string>
  // Admin callbacks. Render the edit + delete icon buttons only when both are
  // provided; the table stays purely presentational for non-admin viewers.
  onEditSeason?: (year: number) => void
  onDeleteSeason?: (year: number) => void
}

// Short Swedish month labels indexed 0..11 (Jan..Dec). The season only
// touches positions 4..9 (Maj..Okt) in practice, but the array keeps the
// lookup branchless.
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Maj',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dec',
] as const

export function DisponeringslistaTable({
  schedules,
  ownedPartIds,
  onEditSeason,
  onDeleteSeason,
}: Props) {
  if (schedules.length === 0) {
    return <p className="text-muted-foreground text-sm">Inga säsonger är inlagda än.</p>
  }

  const currentYear = new Date().getFullYear()

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-center font-heading font-semibold text-lg tracking-tight">
        Disponeringslista
      </h2>
      <WideLayout
        schedules={schedules}
        ownedPartIds={ownedPartIds}
        currentYear={currentYear}
        onEditSeason={onEditSeason}
        onDeleteSeason={onDeleteSeason}
      />
      <MobileLayout
        schedules={schedules}
        ownedPartIds={ownedPartIds}
        currentYear={currentYear}
        onEditSeason={onEditSeason}
        onDeleteSeason={onDeleteSeason}
      />
    </section>
  )
}

type LayoutProps = Props & { currentYear: number }

function WideLayout({
  schedules,
  ownedPartIds,
  currentYear,
  onEditSeason,
  onDeleteSeason,
}: LayoutProps) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border bg-card lg:block">
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
                ownedPartIds={ownedPartIds}
                onEditSeason={onEditSeason}
                onDeleteSeason={onDeleteSeason}
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
  ownedPartIds: ReadonlySet<string>
  onEditSeason?: (year: number) => void
  onDeleteSeason?: (year: number) => void
}

function YearBlock({
  schedule: s,
  isCurrent,
  isFirstYear,
  monthEndWeeks,
  ownedPartIds,
  onEditSeason,
  onDeleteSeason,
}: YearBlockProps) {
  const lastBandIdx = s.monthBands.length - 1
  // First row of every year (except the very first) gets the heavy top border
  // that separates one year-block from the next.
  const yearTop = isFirstYear ? '' : 'border-t-2 border-border'
  const showAdminActions = !!onEditSeason && !!onDeleteSeason

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
            {MONTH_LABELS[band.month]}
          </th>
        ))}
        {showAdminActions && (
          <th className="w-[1%] whitespace-nowrap border-l bg-muted px-3 py-1 text-center font-semibold">
            Åtgärder
          </th>
        )}
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
        {showAdminActions && (
          <td rowSpan={2} className="border-l px-2 align-middle">
            <div className="flex justify-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Redigera"
                onClick={() => onEditSeason(s.year)}
              >
                <PencilIcon />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Ta bort"
                className="text-destructive hover:text-destructive"
                onClick={() => onDeleteSeason(s.year)}
              >
                <Trash2Icon />
              </Button>
            </div>
          </td>
        )}
      </tr>
      <tr>
        {s.cells.map((cell) => {
          const isMine = ownedPartIds.has(cell.partId)
          return (
            <td
              key={cell.week}
              className={cn(
                'px-1 py-2 text-center font-medium',
                monthEndWeeks.has(cell.week) && 'border-r',
                isCurrent
                  ? cn(shareBackgroundClass[cell.shareCode], 'font-bold text-foreground')
                  : 'text-muted-foreground',
                isMine && cn('ring-2 ring-inset', shareRingClass[cell.shareCode]),
              )}
            >
              {cell.shareCode}
            </td>
          )
        })}
      </tr>
    </>
  )
}

function MobileLayout({
  schedules,
  ownedPartIds,
  currentYear,
  onEditSeason,
  onDeleteSeason,
}: LayoutProps) {
  return (
    <div className="flex flex-col gap-4 lg:hidden">
      {schedules.map((s) => (
        <YearCard
          key={s.year}
          schedule={s}
          isCurrent={s.year === currentYear}
          ownedPartIds={ownedPartIds}
          onEditSeason={onEditSeason}
          onDeleteSeason={onDeleteSeason}
        />
      ))}
    </div>
  )
}

type YearCardProps = {
  schedule: YearSchedule
  isCurrent: boolean
  ownedPartIds: ReadonlySet<string>
  onEditSeason?: (year: number) => void
  onDeleteSeason?: (year: number) => void
}

function YearCard({
  schedule,
  isCurrent,
  ownedPartIds,
  onEditSeason,
  onDeleteSeason,
}: YearCardProps) {
  const showAdminActions = !!onEditSeason && !!onDeleteSeason

  return (
    <article
      className={cn(
        'overflow-hidden rounded-lg border bg-card',
        isCurrent && 'ring-1 ring-primary/30',
      )}
    >
      <header className="flex items-center gap-2 border-b bg-muted px-4 py-2">
        {isCurrent && <StarIcon className="size-4 text-primary" aria-hidden />}
        <span className="font-semibold tabular-nums">{schedule.year}</span>
        {showAdminActions && (
          <div className="ml-auto flex gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Redigera"
              onClick={() => onEditSeason(schedule.year)}
            >
              <PencilIcon />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Ta bort"
              className="text-destructive hover:text-destructive"
              onClick={() => onDeleteSeason(schedule.year)}
            >
              <Trash2Icon />
            </Button>
          </div>
        )}
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
              ownedPartIds={ownedPartIds}
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
  ownedPartIds: ReadonlySet<string>
}

function MonthSection({ band, cells, isCurrent, ownedPartIds }: MonthSectionProps) {
  // Months with an odd number of weeks (e.g. 1-week Okt, 5-week Jul/Sep)
  // would leave the last grid row half-empty, breaking the continuous
  // vertical and horizontal dividers. Render an aria-hidden placeholder in
  // that empty slot so the inner border lines run unbroken across the grid.
  const needsPlaceholder = cells.length % 2 === 1
  return (
    <section className="border-b last:border-b-0">
      <h3 className="bg-muted/50 px-4 py-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
        {MONTH_LABELS[band.month]}
      </h3>
      <div className="grid grid-cols-2">
        {cells.map((cell, i) => (
          <div
            key={cell.week}
            className={cn(
              'flex items-center justify-between px-4 py-2',
              // Inner cell separators — every left-column cell carries the
              // vertical divider to the right; rows past the first carry the
              // horizontal divider on top.
              i % 2 === 0 && 'border-r',
              i >= 2 && 'border-t',
              isCurrent && shareBackgroundClass[cell.shareCode],
              ownedPartIds.has(cell.partId) &&
                cn('ring-2 ring-inset', shareRingClass[cell.shareCode]),
            )}
          >
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
        ))}
        {needsPlaceholder && <div className={cn(cells.length >= 3 && 'border-t')} aria-hidden />}
      </div>
    </section>
  )
}
