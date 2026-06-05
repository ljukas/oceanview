import type * as React from 'react'

import { cn } from '~/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // base box: sizing, shape, border, background, spacing, text, outline reset, transitions
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors',
        // style the native file-picker button
        'file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm',
        // placeholder text + focus ring
        'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        // disabled state
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50',
        // invalid state (aria-invalid) + its dark-mode variants
        'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        // responsive type scale + dark base background + dark disabled background
        'md:text-sm dark:bg-input/30 dark:disabled:bg-input/80',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
