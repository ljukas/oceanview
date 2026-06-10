import { createFileRoute } from '@tanstack/react-router'
import { KeyRoundIcon } from 'lucide-react'
import { Suspense, useState } from 'react'
import { AddPasskeyButton } from '~/components/passkey/AddPasskeyButton'
import { DeletePasskeyDialog } from '~/components/passkey/DeletePasskeyDialog'
import { PasskeyRow } from '~/components/passkey/PasskeyRow'
import { TooltipProvider } from '~/components/ui/tooltip'
import { AvatarUpload } from '~/components/user/AvatarUpload'
import { useListPasskeys } from '~/hooks/usePasskeys'
import { orpc } from '~/lib/orpc/client'
import { m } from '~/paraglide/messages'
import { seo } from '~/utils/seo'

export const Route = createFileRoute('/_authenticated/account')({
  head: () => ({
    meta: seo({
      title: m.meta_account_title(),
      description: m.meta_account_description(),
    }),
  }),
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(orpc.user.me.queryOptions())
  },
  component: Account,
})

function Account() {
  const { data: passkeys = [], isLoading } = useListPasskeys()

  const [deletePasskeyId, setDeletePasskeyId] = useState<string | null>(null)

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6 p-4 md:p-8">
        <header className="flex flex-col gap-2">
          <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">{m.account_title()}</h1>
          <p className="text-muted-foreground text-sm">{m.account_description()}</p>
        </header>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="font-semibold text-xl">{m.account_avatar_heading()}</h2>
            <p className="text-muted-foreground text-sm">{m.account_avatar_description()}</p>
          </div>
          <Suspense
            fallback={<div className="text-muted-foreground text-sm">{m.common_loading()}</div>}
          >
            <AvatarUpload />
          </Suspense>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="font-semibold text-xl">{m.account_passkeys_heading()}</h2>
            <p className="text-muted-foreground text-sm">{m.account_passkeys_description()}</p>
          </div>

          <AddPasskeyButton />

          <div className="rounded-lg border bg-card">
            {isLoading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                {m.common_loading()}
              </div>
            ) : passkeys.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <KeyRoundIcon className="size-8 text-muted-foreground" />
                <p className="font-medium text-sm">{m.account_passkeys_empty_title()}</p>
                <p className="text-muted-foreground text-sm">
                  {m.account_passkeys_empty_description()}
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {passkeys.map((pk) => (
                  <PasskeyRow key={pk.id} passkey={pk} onDelete={() => setDeletePasskeyId(pk.id)} />
                ))}
              </ul>
            )}
          </div>
        </section>

        <DeletePasskeyDialog passkeyId={deletePasskeyId} onClose={() => setDeletePasskeyId(null)} />
      </div>
    </TooltipProvider>
  )
}
