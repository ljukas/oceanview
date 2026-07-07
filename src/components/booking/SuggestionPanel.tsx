import { Button } from '~/components/ui/button'
import type { Suggestion } from '~/lib/services/booking/logic'
import { m } from '~/paraglide/messages'

type SuggestionPanelProps = {
  suggestion: Suggestion
  onApply: () => void
  applying: boolean
}

// Quiet banner (ADR-0020 §UI): satisfaction summary + move pills
// (cycles, auto-granted extras) + apply. Contested extras are listed for
// manual assignment — deliberately no fairness algorithm.
export function SuggestionPanel({ suggestion, onApply, applying }: SuggestionPanelProps) {
  const pills = [
    ...suggestion.cycles.map((cycle) =>
      cycle.length === 2 ? `${cycle[0]} ↔ ${cycle[1]}` : [...cycle, cycle[0]].join(' → '),
    ),
    ...suggestion.autoExtras.map((x) => `${x.firstWeek}–${x.lastWeek} → ${x.holder}`),
  ]
  const hasMoves = pills.length > 0
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-brand/5 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">
          {hasMoves
            ? m.booking_suggestion_summary({
                satisfied: suggestion.satisfiedShares.length,
                total: suggestion.tradeWishShares.length,
              })
            : m.booking_suggestion_none()}
        </p>
        {hasMoves ? (
          <Button size="sm" className="ml-auto" onClick={onApply} disabled={applying}>
            {m.booking_suggestion_apply()}
          </Button>
        ) : null}
      </div>
      {hasMoves ? (
        <div className="flex flex-wrap gap-1.5">
          {pills.map((pill) => (
            <span
              key={pill}
              className="rounded-full bg-brand/10 px-2 py-0.5 text-brand text-xs tabular-nums"
            >
              {pill}
            </span>
          ))}
        </div>
      ) : null}
      {suggestion.openExtras.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {m.booking_suggestion_open_extras({
            list: suggestion.openExtras
              .map((x) => `${x.firstWeek}–${x.lastWeek} (${x.interested.join(', ')})`)
              .join(' · '),
          })}
        </p>
      ) : null}
    </div>
  )
}
