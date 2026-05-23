import { blurhashToCssGradientString } from '@unpic/placeholder'
import { Image } from '@unpic/react/base'
import { Avatar as AvatarPrimitive } from 'radix-ui'
import type * as React from 'react'
import { useMemo, useState } from 'react'

import { transformer } from '~/lib/image/transformer'
import { cn } from '~/lib/utils'

function Avatar({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: 'default' | 'sm' | 'lg'
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        'group/avatar relative flex size-8 shrink-0 select-none rounded-full after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten',
        className,
      )}
      {...props}
    />
  )
}

// Bypasses Radix `AvatarPrimitive.Image` deliberately: Radix preloads `src` via
// a parallel JS `Image()` before mounting the real `<img>`, which would force a
// second request to the raw Blob URL on top of unpic's optimized one. We render
// the unpic Image directly with absolute positioning, layered over the
// permanent fallback — so the image covers it on success, and `onError` removes
// the img to reveal the fallback again.
function AvatarImage({
  className,
  src,
  alt,
  width,
  height,
  blurhash,
}: {
  className?: string
  src: string
  alt: string
  width: number
  height: number
  blurhash?: string | null
}) {
  const [hasError, setHasError] = useState(false)
  // Memoize the gradient string — blurhashToCssGradientString builds a
  // multi-stop CSS expression and we don't want it recomputed each render.
  const gradient = useMemo(
    () => (blurhash ? blurhashToCssGradientString(blurhash) : null),
    [blurhash],
  )
  if (hasError) return null
  return (
    <>
      {gradient ? (
        <span
          aria-hidden
          data-slot="avatar-blurhash"
          className="absolute inset-0 size-full rounded-full"
          style={{ backgroundImage: gradient }}
        />
      ) : null}
      <Image
        data-slot="avatar-image"
        src={src}
        alt={alt}
        width={width}
        height={height}
        layout="constrained"
        transformer={transformer}
        onError={() => setHasError(true)}
        className={cn('absolute inset-0 size-full rounded-full object-cover', className)}
      />
    </>
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center rounded-full bg-muted text-muted-foreground text-sm group-data-[size=sm]/avatar:text-xs',
        className,
      )}
      {...props}
    />
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        'absolute right-0 bottom-0 z-10 inline-flex select-none items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background',
        'group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden',
        'group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2',
        'group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2',
        className,
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        'group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background',
        className,
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        'relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3',
        className,
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage }
