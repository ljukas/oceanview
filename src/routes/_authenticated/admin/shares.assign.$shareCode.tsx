import { useSuspenseQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Navigate,
  redirect,
  useCanGoBack,
  useRouter,
} from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { useMemo } from 'react'
import { ShareAssignForm } from '~/components/share/ShareAssignForm'
import { Button } from '~/components/ui/button'
import { orpc } from '~/lib/orpc/client'
import { SHARE_CODES, type ShareCode } from '~/lib/shares/codes'
import { m } from '~/paraglide/messages'
import { seo } from '~/utils/seo'

function isShareCode(code: string): code is ShareCode {
  return (SHARE_CODES as ReadonlyArray<string>).includes(code)
}

export const Route = createFileRoute('/_authenticated/admin/shares/assign/$shareCode')({
  head: () => ({
    meta: seo({ title: m.meta_shares_title(), description: m.meta_shares_description() }),
  }),
  loader: async ({ context: { queryClient }, params }) => {
    // Guard an invalid code before fetching; parts existence is checked in the
    // component (every valid share is a fixed A1/A2 pair, so this never trips).
    if (!isShareCode(params.shareCode)) throw redirect({ to: '/admin/shares' })
    await Promise.all([
      queryClient.ensureQueryData(orpc.share.listAll.queryOptions()),
      queryClient.ensureQueryData(orpc.user.list.queryOptions({ input: { filter: 'active' } })),
    ])
  },
  component: AssignSharePage,
})

function AssignSharePage() {
  const { shareCode } = Route.useParams()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const canGoBack = useCanGoBack()

  // Pop history (restores the grid's scroll via scrollRestoration) when we got
  // here from the grid; fall back to a fresh navigate on a cold deep-link.
  const goBack = () => {
    if (canGoBack) router.history.back()
    else navigate({ to: '/admin/shares' })
  }

  const { data: parts } = useSuspenseQuery(orpc.share.listAll.queryOptions())
  const { data: users } = useSuspenseQuery(
    orpc.user.list.queryOptions({ input: { filter: 'active' } }),
  )

  const userOptions = useMemo(
    () => users.map((u) => ({ id: u.id, name: u.name, image: u.image })),
    [users],
  )

  // `shareCode` is validated in the loader; narrow it for the form's typed prop.
  const code = shareCode as ShareCode
  const part1 = parts.find((p) => p.shareCode === code && p.partNumber === 1)
  const part2 = parts.find((p) => p.shareCode === code && p.partNumber === 2)
  if (!part1 || !part2) return <Navigate to="/admin/shares" replace />

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <Button variant="ghost" size="sm" className="-ml-2 self-start" onClick={goBack}>
        <ArrowLeftIcon />
        {m.common_back()}
      </Button>

      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">
          {m.share_assign_title({ code })}
        </h1>
        <p className="text-muted-foreground text-sm">{m.share_assign_description()}</p>
      </header>

      <div className="max-w-md">
        <ShareAssignForm
          shareCode={code}
          part1={part1}
          part2={part2}
          users={userOptions}
          onDone={goBack}
        />
      </div>
    </div>
  )
}
