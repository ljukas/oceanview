import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { PageContainer } from '~/components/layout/PageContainer'
import { PasskeySetupPrompt } from '~/components/passkey/PasskeySetupPrompt'
import { DisponeringslistaTable } from '~/components/season/DisponeringslistaTable'
import { usePasskeySetupPrompt } from '~/hooks/usePasskeys'
import { orpc } from '~/lib/orpc/client'
import { m } from '~/paraglide/messages'

export const Route = createFileRoute('/_authenticated/')({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(orpc.season.listSchedules.queryOptions())
    await queryClient.ensureQueryData(orpc.share.listMine.queryOptions())
  },
  component: Calendar,
})

function Calendar() {
  const { data: schedules } = useSuspenseQuery(orpc.season.listSchedules.queryOptions())
  const { data: ownedShares } = useSuspenseQuery(orpc.share.listMine.queryOptions())

  const ownedShareCodes = new Set(ownedShares)

  // Periodic passkey nudge: self-gates on zero passkeys + the per-device snooze window
  // (see usePasskeySetupPrompt), so it re-appears "sometimes" for anyone without a passkey
  // — including invitees who skipped the onboarding step — rather than only after sign-in.
  const passkeyPrompt = usePasskeySetupPrompt()

  return (
    <PageContainer width="full" fill>
      <h1 className="font-bold text-2xl tracking-tight text-balance md:text-3xl">
        {m.nav_calendar()}
      </h1>
      <DisponeringslistaTable schedules={schedules} ownedShareCodes={ownedShareCodes} />
      <PasskeySetupPrompt
        open={passkeyPrompt.open}
        pending={passkeyPrompt.pending}
        onCreate={passkeyPrompt.create}
        onDismiss={passkeyPrompt.dismiss}
      />
    </PageContainer>
  )
}
