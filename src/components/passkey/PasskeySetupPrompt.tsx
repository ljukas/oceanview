import { KeyRoundIcon } from 'lucide-react'
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

type Props = {
  open: boolean
  pending: boolean
  onCreate: () => void
  onDismiss: () => void
}

// Explanatory prompt shown right after sign-in when the user has no passkey yet. Only
// the "Skapa passkey" button triggers the OS dialog; closing or "Inte nu" dismisses and
// suppresses the prompt for a while (handled by the caller).
export function PasskeySetupPrompt({ open, pending, onCreate, onDismiss }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss()
      }}
    >
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-5" />
            Snabbare inloggning
          </DialogTitle>
          <DialogDescription>
            Skapa en passkey så loggar du in direkt med Face ID, Touch ID eller en säkerhetsnyckel
            nästa gång — utan att vänta på ett mejl.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button type="button" className="w-full" disabled={pending} onClick={onCreate}>
            {pending ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon />}
            Skapa passkey
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={pending}
            onClick={onDismiss}
          >
            Inte nu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
