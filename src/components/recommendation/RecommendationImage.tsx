import { blurhashToCssGradientString } from '@unpic/placeholder'
import { Image } from '@unpic/react/base'
import { useMemo } from 'react'
import { snapBreakpoints } from '~/lib/image/sizes'
import { transformer } from '~/lib/image/transformer'
import { cn } from '~/lib/utils'

// Renders a public-store image at an on-demand size with a blurhash placeholder,
// reusing the exact transformer + breakpoints path as src/components/ui/avatar.tsx.
// `src` MUST be a full public URL (coverUrl / photos[].url from the enriched reads),
// not a bare pathname — the transformer routes the blob host through /_vercel/image.
export function RecommendationImage({
  src,
  blurhash,
  alt,
  width,
  height,
  className,
}: {
  src: string
  blurhash: string | null
  alt: string
  width: number
  height: number
  className?: string
}) {
  const background = useMemo(
    () => (blurhash ? blurhashToCssGradientString(blurhash) : undefined),
    [blurhash],
  )
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      background={background}
      layout="constrained"
      breakpoints={snapBreakpoints(width)}
      transformer={transformer}
      className={cn('object-cover', className)}
    />
  )
}
