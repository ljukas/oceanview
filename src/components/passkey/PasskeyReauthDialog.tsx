import { CheckIcon, KeyRoundIcon, MailIcon, ShieldCheckIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Spinner } from '~/components/ui/spinner'
import { useAwaitFreshSession } from '~/hooks/useAwaitFreshSession'
import { useAddPasskey } from '~/hooks/usePasskeys'
import { authClient } from '~/lib/authClient'

type Props = {
  open: boolean
  email: string
  onClose: () => void
}

// Shown when adding a passkey fails because the session is no longer fresh (older than
// `freshAge`, see src/lib/auth.ts). Better Auth requires recent authentication for credential
// changes, so we send a fresh magic link and let the user finish the add — the same magic-link
// re-entry flow as login (authClient.signIn.magicLink → /signed-in), without leaving Account.
export function PasskeyReauthDialog({ open, email, onClose }: Props) {
  const [state, setState] = useState<'prompt' | 'sent'>('prompt')
  const [sending, setSending] = useState(false)
  const [fresh, setFresh] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  // Reset to a clean slate every time the dialog opens.
  useEffect(() => {
    if (!open) return
    setState('prompt')
    setSending(false)
    setFresh(false)
    setHint(null)
  }, [open])

  const addPasskey = useAddPasskey({
    onAdded: () => {
      toast.success('Passkey kopplad. Nästa gång loggar du in direkt.')
      onClose()
    },
    onNotFresh: () => setHint('Inte bekräftad än — öppna länken vi skickade först.'),
  })

  // Cosmetic: flip the status copy once the magic link re-freshens the session in the other tab.
  useAwaitFreshSession({
    enabled: open && state === 'sent' && !fresh,
    onFresh: () => setFresh(true),
  })

  async function sendLink() {
    setSending(true)
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: '/signed-in?redirect=/account',
    })
    setSending(false)
    if (error) {
      toast.error(error.message ?? 'Kunde inte skicka inloggningslänken')
      return
    }
    setState('sent')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent showCloseButton={!addPasskey.isPending}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-5" />
            Bekräfta din identitet
          </DialogTitle>
          <DialogDescription>
            {state === 'prompt' ? (
              <>
                Av säkerhetsskäl behöver du logga in igen innan du lägger till en passkey. Vi
                skickar en inloggningslänk till <strong className="text-foreground">{email}</strong>
                .
              </>
            ) : (
              <>
                Vi skickade en länk till <strong className="text-foreground">{email}</strong>. Öppna
                den (kolla inkorgen eller serverloggen tills vidare), kom tillbaka hit och tryck på
                Lägg till passkey.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {state === 'sent' && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            {fresh ? (
              <>
                <CheckIcon className="size-4 text-primary" />
                Identitet bekräftad.
              </>
            ) : (
              <>
                <Spinner className="size-4" />
                Väntar på bekräftelse…
              </>
            )}
          </div>
        )}

        {hint && <p className="text-destructive text-sm">{hint}</p>}

        <DialogFooter>
          {state === 'prompt' ? (
            <Button type="button" className="w-full" disabled={sending} onClick={sendLink}>
              {sending ? <Spinner data-icon="inline-start" /> : <MailIcon />}
              Skicka inloggningslänk
            </Button>
          ) : (
            <Button
              type="button"
              className="w-full"
              disabled={addPasskey.isPending}
              onClick={() => {
                setHint(null)
                addPasskey.mutate()
              }}
            >
              {addPasskey.isPending ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon />}
              Lägg till passkey
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
