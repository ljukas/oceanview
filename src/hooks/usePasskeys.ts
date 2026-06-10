import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { authClient } from '~/lib/authClient'
import { isPasskeyPromptSuppressed, suppressPasskeyPrompt } from '~/lib/passkeyPrompt'
import { m } from '~/paraglide/messages'

export const passkeysQueryKey = ['passkeys'] as const

export type Passkey = {
  id: string
  name?: string | null
  createdAt?: Date | string | null
  deviceType?: string | null
  aaguid?: string | null
  backedUp?: boolean | null
  transports?: string | null
}

function isUserDismissed(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'NotAllowedError'
}

// Better Auth's passkey-registration endpoint runs freshSessionMiddleware, which rejects with
// this code (HTTP 403) once the session is older than `freshAge` (see src/lib/auth.ts). Callers
// that pass `onNotFresh` get a chance to recover (re-auth) instead of just toasting.
function isSessionNotFresh(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'SESSION_NOT_FRESH'
}

function errorMessage(err: unknown, fallback: string): string {
  return (err as { message?: string } | null)?.message ?? fallback
}

// Client-only feature detection, optimistic: WebAuthn has been universal since ~2019,
// so assume support during SSR and the first client render (markup matches, no pop-in)
// and demote after mount on the rare browser without it. Used to decide whether to
// show an explicit "sign in with passkey" button.
export function usePasskeySupport(): boolean {
  const [supported, setSupported] = useState(true)
  useEffect(() => {
    if (!window.PublicKeyCredential) setSupported(false)
  }, [])
  return supported
}

export function useListPasskeys() {
  return useQuery({
    queryKey: passkeysQueryKey,
    queryFn: async () => {
      const result = await authClient.passkey.listUserPasskeys()
      if (result.error) throw new Error(result.error.message ?? 'list failed')
      return (result.data ?? []) as Array<Passkey>
    },
  })
}

export function useAddPasskey(options?: { onAdded?: () => void; onNotFresh?: () => void }) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const result = await authClient.passkey.addPasskey({})
      if (result?.error) throw result.error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: passkeysQueryKey })
      options?.onAdded?.()
    },
    onError: (err) => {
      if (isUserDismissed(err)) return
      if (isSessionNotFresh(err) && options?.onNotFresh) {
        options.onNotFresh()
        return
      }
      toast.error(errorMessage(err, m.passkey_add_error()))
    },
  })
}

export function useRenamePasskey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const result = await authClient.passkey.updatePasskey(input)
      if (result?.error) throw result.error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: passkeysQueryKey })
    },
    onError: (err) => {
      toast.error(errorMessage(err, m.passkey_rename_error()))
    },
  })
}

export function useDeletePasskey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await authClient.passkey.deletePasskey({ id })
      if (result?.error) throw result.error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: passkeysQueryKey })
    },
    onError: (err) => {
      toast.error(errorMessage(err, m.passkey_delete_error()))
    },
  })
}

// Explicit, modal passkey sign-in (no autofill) — the primary login button. WebAuthn
// discovers the relying party's passkeys, so no email is needed. Dismissals
// (NotAllowedError) are silent; other errors toast.
export function useSignInPasskey(options: { onSignedIn: () => void }) {
  const { onSignedIn } = options
  const [pending, setPending] = useState(false)

  const signIn = useCallback(async () => {
    setPending(true)
    const result = await authClient.signIn.passkey()
    setPending(false)
    if (result?.error) {
      if (isUserDismissed(result.error)) return
      toast.error(errorMessage(result.error, m.passkey_signin_error()))
      return
    }
    onSignedIn()
  }, [onSignedIn])

  return { signIn, pending }
}

export function useSignInPasskeyAutofill(options: { onSignedIn: () => void }) {
  const { onSignedIn } = options

  useEffect(() => {
    // isConditionalMediationAvailable() returns a Promise — await it before invoking
    // autofill, and skip if the effect was torn down while we waited.
    let active = true
    async function start() {
      const canConditional = await window.PublicKeyCredential?.isConditionalMediationAvailable?.()
      if (!canConditional || !active) return

      void authClient.signIn.passkey({
        autoFill: true,
        fetchOptions: {
          onSuccess: () => {
            onSignedIn()
          },
          onError: ({ error }) => {
            if (error?.code === 'NotAllowedError') return
            toast.error(error?.message ?? m.passkey_signin_error())
          },
        },
      })
    }
    void start()
    return () => {
      active = false
    }
  }, [onSignedIn])
}

// Drives the explanatory "create a passkey" prompt shown right after sign-in. We never
// auto-open the OS dialog — only the prompt's button does. `open` is true only when the
// caller enables it, the user has no passkeys yet, the device isn't in the dismissal
// window, and the browser supports passkeys at all.
export function usePasskeySetupPrompt(options: { enabled: boolean }) {
  const { enabled } = options
  const isSupported = usePasskeySupport()
  const passkeysQuery = useListPasskeys()
  const [dismissed, setDismissed] = useState(false)
  const suppressed = useRef(isPasskeyPromptSuppressed())

  const addPasskey = useAddPasskey({
    onAdded: () => {
      toast.success(m.passkey_added())
      setDismissed(true)
    },
  })

  const open =
    enabled &&
    isSupported &&
    !dismissed &&
    !suppressed.current &&
    !passkeysQuery.isLoading &&
    (passkeysQuery.data ?? []).length === 0

  const create = useCallback(() => addPasskey.mutate(), [addPasskey])

  const dismiss = useCallback(() => {
    suppressPasskeyPrompt()
    setDismissed(true)
  }, [])

  return { open, create, dismiss, pending: addPasskey.isPending }
}
