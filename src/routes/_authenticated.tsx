import { environmentManager } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppSidebar } from '~/components/AppSidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '~/components/ui/sidebar'
import { TooltipProvider } from '~/components/ui/tooltip'
import { useRealtimeSync } from '~/hooks/useRealtimeSync'
import { getSession } from '~/lib/getSession'
import { ensureSavedEmail } from '~/lib/savedEmailFns'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const session = await getSession()
    if (!session || session.user.deletedAt) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    if (environmentManager.isServer()) {
      await ensureSavedEmail({ data: { email: session.user.email } })
    }
    return { user: session.user }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext()
  useRealtimeSync()

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar user={user} />
        <SidebarInset>
          <header className="flex h-12 items-center gap-2 border-b px-4 lg:hidden">
            <SidebarTrigger />
          </header>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
