import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AppSidebar } from '~/components/app-sidebar'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '~/components/ui/sidebar'
import { getSession } from '~/lib/get-session'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: '/login' })
    return { session }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger />
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
