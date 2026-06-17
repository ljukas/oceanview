import type * as React from 'react'
import { cn } from '~/lib/utils'

const widths = {
  default: 'max-w-5xl', // tables, lists
  prose: 'max-w-2xl', // forms, settings, reading
  full: 'max-w-none', // wide data views (document grid)
} as const

/**
 * Shared page wrapper: centers content, constrains width, and owns the page
 * padding once (replacing per-route `flex flex-col gap-6 p-4 md:p-8`).
 * Lives inside `SidebarInset`, so it must not set `h-full` (would double-scroll).
 */
export function PageContainer({
  className,
  width = 'default',
  ...props
}: React.ComponentProps<'div'> & { width?: keyof typeof widths }) {
  return (
    <div
      data-slot="page-container"
      className={cn(
        'mx-auto flex w-full flex-col gap-6 px-4 py-6 md:px-8 md:py-10',
        widths[width],
        className,
      )}
      {...props}
    />
  )
}
