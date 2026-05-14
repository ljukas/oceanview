import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '~/lib/auth-client'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const { data: session, isPending } = authClient.useSession()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function onSubmit(e: React.SubmitEvent) {
    e.preventDefault()
    setStatus('sending')
    setErrorMessage('')
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: '/',
    })
    if (error) {
      setStatus('error')
      setErrorMessage(error.message ?? 'Something went wrong')
    } else {
      setStatus('sent')
    }
  }

  if (isPending) {
    return <div className="p-4">Loading…</div>
  }

  if (session) {
    return (
      <div className="p-4 space-y-2">
        <h1 className="text-2xl font-semibold">Oceanview</h1>
        <p>Signed in as <strong>{session.user.email}</strong> ({session.user.role ?? 'user'}).</p>
        <button
          onClick={() => authClient.signOut()}
          className="px-3 py-1 border rounded"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-sm space-y-3">
      <h1 className="text-2xl font-semibold">Oceanview</h1>
      <form onSubmit={onSubmit} className="space-y-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full border rounded px-3 py-2"
          disabled={status === 'sending' || status === 'sent'}
        />
        <button
          type="submit"
          disabled={status === 'sending' || status === 'sent'}
          className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending…' : 'Send magic link'}
        </button>
      </form>
      {status === 'sent' && (
        <p className="text-sm">Check your inbox (or the server logs for now) for the sign-in link.</p>
      )}
      {status === 'error' && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  )
}
