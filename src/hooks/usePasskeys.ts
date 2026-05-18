import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { authClient } from '~/lib/authClient'

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

function errorMessage(err: unknown, fallback: string): string {
  return (err as { message?: string } | null)?.message ?? fallback
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

export function useAddPasskey(options?: { onAdded?: () => void }) {
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
      toast.error(errorMessage(err, 'Kunde inte lägga till passkey.'))
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
      toast.error(errorMessage(err, 'Kunde inte byta namn.'))
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
      toast.error(errorMessage(err, 'Kunde inte ta bort passkey.'))
    },
  })
}

export function useSignInPasskeyAutofill(options: { onSignedIn: () => void }) {
  const { onSignedIn } = options

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.PublicKeyCredential?.isConditionalMediationAvailable?.()) return

    void authClient.signIn.passkey({
      autoFill: true,
      fetchOptions: {
        onSuccess: () => {
          onSignedIn()
        },
        onError: ({ error }) => {
          if (error?.code === 'NotAllowedError') return
          toast.error(error?.message ?? 'Kunde inte logga in med passkey.')
        },
      },
    })
  }, [onSignedIn])
}
