import { useQuery } from '@tanstack/react-query'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '~/components/ui/carousel'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '~/components/ui/responsive-dialog'
import { Skeleton } from '~/components/ui/skeleton'
import { orpc } from '~/lib/orpc/client'
import { m } from '~/paraglide/messages'
import { RecommendationImage } from './RecommendationImage'
import { TagChip } from './TagChip'
import { isTagSlug } from './tagLabels'

export function RecommendationDetailDialog({
  placeId,
  open,
  onOpenChange,
}: {
  placeId: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const {
    data: place,
    isLoading,
    isError,
  } = useQuery({
    ...orpc.recommendation.get.queryOptions({ input: { id: placeId ?? '' } }),
    enabled: open && placeId !== undefined,
  })
  const { data: tags } = useQuery(orpc.tag.list.queryOptions())

  const slugById = new Map((tags ?? []).map((t) => [t.id, t.slug]))
  const placeSlugs = (place?.tagIds ?? [])
    .map((id) => slugById.get(id))
    .filter((slug): slug is string => slug !== undefined)
    .filter(isTagSlug)

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-2xl">
        {isError ? (
          // A stale/deleted deep-link (?place=<gone>) — surface it instead of an
          // endless skeleton. Read-only slice: no retry, just an honest message.
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{m.recommendation_error_not_found()}</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
        ) : isLoading || !place ? (
          <div className="flex flex-col gap-4">
            {/* Radix requires a Title for a11y even while the place loads. */}
            <ResponsiveDialogHeader className="sr-only">
              <ResponsiveDialogTitle>{m.common_loading()}</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Carousel className="w-full" opts={{ loop: place.photos.length > 1 }}>
              <CarouselContent>
                {place.photos.map((photo) => (
                  <CarouselItem key={photo.id}>
                    <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
                      <RecommendationImage
                        src={photo.url}
                        blurhash={photo.blurhash}
                        alt={m.recommendation_photo_alt({ title: place.title })}
                        width={800}
                        height={450}
                        className="size-full"
                      />
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {place.photos.length > 1 ? (
                <>
                  <CarouselPrevious />
                  <CarouselNext />
                </>
              ) : null}
            </Carousel>

            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{place.title}</ResponsiveDialogTitle>
              {place.authorName ? (
                <ResponsiveDialogDescription>
                  {m.recommendation_recommended_by({ name: place.authorName })}
                </ResponsiveDialogDescription>
              ) : null}
            </ResponsiveDialogHeader>

            {place.description ? (
              <p className="whitespace-pre-wrap text-sm">{place.description}</p>
            ) : null}

            {placeSlugs.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {placeSlugs.map((slug) => (
                  <TagChip key={slug} slug={slug} />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
