import { useSuspenseQuery } from '@tanstack/react-query'
import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { MapPinIcon } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { z } from 'zod'
import { PageContainer } from '~/components/layout/PageContainer'
import { RecommendationDetailDialog } from '~/components/recommendation/RecommendationDetailDialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty'
import { Skeleton } from '~/components/ui/skeleton'
import { orpc } from '~/lib/orpc/client'
import { m } from '~/paraglide/messages'
import { seo } from '~/utils/seo'

const RecommendationMap = lazy(() => import('~/components/recommendation/RecommendationMap'))

const recommendationsSearchSchema = z.object({
  place: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/recommendations')({
  head: () => ({
    meta: seo({
      title: m.meta_recommendations_title(),
      description: m.meta_recommendations_description(),
    }),
  }),
  validateSearch: recommendationsSearchSchema,
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(orpc.recommendation.list.queryOptions()),
      queryClient.ensureQueryData(orpc.tag.list.queryOptions()),
    ])
  },
  component: Recommendations,
})

function Recommendations() {
  const navigate = Route.useNavigate()
  const place = Route.useSearch({ select: (s) => s.place })
  const { data: places } = useSuspenseQuery(orpc.recommendation.list.queryOptions())

  if (places.length === 0) {
    return (
      <PageContainer width="default">
        <Header />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapPinIcon className="size-8" />
            </EmptyMedia>
            <EmptyTitle>{m.recommendations_empty_title()}</EmptyTitle>
            <EmptyDescription>{m.recommendations_empty_description()}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </PageContainer>
    )
  }

  return (
    <PageContainer width="full" fill>
      <Header />
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border">
        <ClientOnly fallback={<Skeleton className="size-full" />}>
          <Suspense fallback={<Skeleton className="size-full" />}>
            <RecommendationMap
              places={places}
              onSelect={(id) => navigate({ to: '.', search: { place: id } })}
            />
          </Suspense>
        </ClientOnly>
      </div>

      <RecommendationDetailDialog
        placeId={place}
        open={place !== undefined}
        onOpenChange={(next) => {
          if (!next) navigate({ to: '.', search: {} })
        }}
      />
    </PageContainer>
  )
}

function Header() {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-balance font-bold text-2xl tracking-tight md:text-3xl">
        {m.recommendations_title()}
      </h1>
      <p className="max-w-2xl text-muted-foreground text-sm">{m.recommendations_description()}</p>
    </header>
  )
}
