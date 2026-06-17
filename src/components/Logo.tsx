import { SailboatIcon } from 'lucide-react'
import type * as React from 'react'
import { cn } from '~/lib/utils'

/**
 * The brand mark: the Lucide sailboat (same glyph as `public/favicon.svg`) on a
 * `--brand` tile. Size the whole mark via `className` (e.g. `size-7`); the glyph
 * scales with the tile. Labelled "Oceanview" by default; pass `decorative` when
 * an adjacent text label already names it (as in `Wordmark`).
 */
export function LogoMark({
  className,
  decorative = false,
  ...props
}: React.ComponentProps<'span'> & { decorative?: boolean }) {
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img', 'aria-label': 'Oceanview' }
  return (
    <span
      className={cn(
        'inline-flex aspect-square items-center justify-center rounded-md bg-brand text-brand-foreground',
        className,
      )}
      {...a11y}
      {...props}
    >
      <SailboatIcon className="size-[60%]" aria-hidden="true" />
    </span>
  )
}

/** The mark + the "Oceanview" wordmark, set in the heading face. */
export function Wordmark({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      <LogoMark decorative className="size-7 shrink-0" />
      {/* The word hides when an enclosing sidebar collapses to the icon rail; the
          class is inert anywhere there is no `[data-collapsible=icon]` group (e.g. login). */}
      <span className="truncate font-heading font-semibold text-lg tracking-tight group-data-[collapsible=icon]:hidden">
        Oceanview
      </span>
    </div>
  )
}
