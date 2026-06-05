import type * as React from 'react'

import { cn } from '~/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // base box: auto-grow to fit content + layout, shape, border, background, spacing, text, outline, transition
        'field-sizing-content flex min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none transition-colors',
        // placeholder color + keyboard focus ring
        'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        // disabled state
        'disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50',
        // invalid state (aria-invalid + dark variants)
        'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        // responsive text size + dark base background/disabled
        'md:text-sm dark:bg-input/30 dark:disabled:bg-input/80',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
