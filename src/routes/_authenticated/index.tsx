import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { orpc } from '~/lib/orpc/client'

export const Route = createFileRoute('/_authenticated/')({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(orpc.health.ping.queryOptions()),
  component: Calendar,
})

function Calendar() {
  const { data } = useSuspenseQuery(orpc.health.ping.queryOptions({ staleTime: 0 }))

  return (
    <div className="p-4">
      <h1 className="font-semibold text-2xl">Kalender</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Serverklocka: {data.at.toLocaleString('sv-SE')}
      </p>
    </div>
  )
}
