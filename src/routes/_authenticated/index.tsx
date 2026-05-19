import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { DisponeringslistaTable } from '~/components/season/DisponeringslistaTable'
import { useAddPasskey, useListPasskeys } from '~/hooks/usePasskeys'
import { orpc } from '~/lib/orpc/client'

const indexSearchSchema = z.object({
  passkey: z.enum(['setup']).optional(),
})

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: indexSearchSchema,
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(orpc.season.listSchedules.queryOptions()),
  component: Calendar,
})

function Calendar() {
  const { data: schedules } = useSuspenseQuery(orpc.season.listSchedules.queryOptions())
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
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">Kalender</h1>
      <DisponeringslistaTable schedules={schedules} />
    </div>
  )
}
