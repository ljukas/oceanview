import { createFileRoute, useRouter } from '@tanstack/react-router'
import { authClient } from '~/lib/auth-client'

export const Route = createFileRoute('/_authenticated/')({
  component: Home,
})

function Home() {
  const { session } = Route.useRouteContext()
  const router = useRouter()
  const roleLabel = session.user.role === 'admin' ? 'administratör' : 'medlem'

  async function onSignOut() {
    await authClient.signOut()
    await router.invalidate()
    await router.navigate({ to: '/login' })
  }

  return (
    <div className="p-4 space-y-2">
      <h1 className="text-2xl font-semibold">Oceanview</h1>
      <p>Inloggad som <strong>{session.user.email}</strong> ({roleLabel}).</p>
      <button
        onClick={onSignOut}
        className="px-3 py-1 border rounded"
      >
        Logga ut
      </button>
    </div>
  )
}
