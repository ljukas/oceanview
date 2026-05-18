import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAddPasskey, useListPasskeys } from '~/hooks/usePasskeys'
import { orpc } from '~/lib/orpc/client'

const indexSearchSchema = z.object({
  passkey: z.enum(['setup']).optional(),
})

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: indexSearchSchema,
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(orpc.health.ping.queryOptions()),
  component: Calendar,
})

function Calendar() {
  const { data } = useSuspenseQuery(orpc.health.ping.queryOptions({ staleTime: 0 }))
  const passkeyParam = Route.useSearch({ select: (s) => s.passkey })
  const navigate = Route.useNavigate()
  const handled = useRef(false)

  const passkeysQuery = useListPasskeys()
  const addPasskey = useAddPasskey({
    onAdded: () => toast.success('Passkey kopplad. Nästa gång loggar du in direkt.'),
  })

  useEffect(() => {
    if (passkeyParam !== 'setup' || handled.current) return
    if (passkeysQuery.isLoading) return
    handled.current = true

    void navigate({ to: '/', search: {}, replace: true })

    if ((passkeysQuery.data ?? []).length > 0) return
    addPasskey.mutate()
  }, [passkeyParam, passkeysQuery.isLoading, passkeysQuery.data, navigate, addPasskey])

  return (
    <div className="p-4">
      <h1 className="font-semibold text-2xl">Kalender</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Serverklocka: {data.at.toLocaleString('sv-SE')}
      </p>
    </div>
  )
}
