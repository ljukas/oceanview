import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AppSidebar } from '~/components/AppSidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '~/components/ui/sidebar'
import { TooltipProvider } from '~/components/ui/tooltip'
import { saveEmail } from '~/hooks/useSavedLogin'
import { getSession } from '~/lib/getSession'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: '/login' })
    if (session.user.deletedAt) throw redirect({ to: '/login' })
    return { user: session.user }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext()

  useEffect(() => {
    saveEmail(user.email)
  }, [user.email])

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
