import { createFileRoute } from '@tanstack/react-router'
import { KeyRoundIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { TooltipProvider } from '~/components/ui/tooltip'
import { useAddPasskey, useListPasskeys } from '~/hooks/usePasskeys'
import { seo } from '~/utils/seo'
import { DeletePasskeyDialog } from './konto/-components/DeletePasskeyDialog'
import { PasskeyRow } from './konto/-components/PasskeyRow'

export const Route = createFileRoute('/_authenticated/konto')({
  head: () => ({
    meta: seo({
      title: 'Konto | Oceanview',
      description: 'Hantera ditt konto och dina passkeys',
    }),
  }),
  component: Konto,
})

function Konto() {
  const { data: passkeys = [], isLoading } = useListPasskeys()
  const { mutate, isPending } = useAddPasskey()

  const [deletePasskeyId, setDeletePasskeyId] = useState<string | null>(null)

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6 p-4 md:p-8">
        <header className="flex flex-col gap-2">
          <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">Konto</h1>
          <p className="text-muted-foreground text-sm">Hantera hur du loggar in på Oceanview.</p>
        </header>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="font-semibold text-xl">Passkeys</h2>
            <p className="text-muted-foreground text-sm">
              Med en passkey loggar du in direkt med Face ID, Touch ID eller en säkerhetsnyckel —
              utan att vänta på ett mejl. Lägg till en passkey per enhet du använder.
            </p>
          </div>

          <div>
            <Button onClick={() => mutate()} disabled={isPending} className="w-full sm:w-auto">
              {isPending ? <Spinner data-icon="inline-start" /> : <PlusIcon />}
              Lägg till passkey
            </Button>
          </div>

          <div className="rounded-lg border bg-card">
            {isLoading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">Laddar…</div>
            ) : passkeys.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <KeyRoundIcon className="size-8 text-muted-foreground" />
                <p className="font-medium text-sm">Inga passkeys kopplade än</p>
                <p className="text-muted-foreground text-sm">
                  Lägg till en passkey för att logga in snabbare nästa gång.
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
