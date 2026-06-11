import { environmentManager } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppSidebar } from '~/components/AppSidebar'
import { UploadQueueBox } from '~/components/document/upload/UploadQueueBox'
import { UploadQueueProvider } from '~/components/document/upload/UploadQueueProvider'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '~/components/ui/sidebar'
import { TooltipProvider } from '~/components/ui/tooltip'
import { HeaderUserMenu } from '~/components/user/UserMenu'
import { useRealtimeSync } from '~/hooks/useRealtimeSync'
import { rememberBrowserUser } from '~/lib/browserSessionFns'
import { getSession } from '~/lib/getSession'
import { orpc } from '~/lib/orpc/client'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const session = await getSession()
    if (!session || session.user.deletedAt) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    if (environmentManager.isServer()) {
      await rememberBrowserUser({
        data: { email: session.user.email, userId: session.user.id },
      })
    }
    return { user: session.user }
  },
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(orpc.user.me.queryOptions()),
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext()
  useRealtimeSync()

  return (
    <UploadQueueProvider>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar user={user} />
          <SidebarInset>
            <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background px-4 md:hidden">
              <SidebarTrigger />
              <div className="ml-auto flex items-center">
                <HeaderUserMenu />
              </div>
            </header>
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
      <UploadQueueBox />
    </UploadQueueProvider>
  )
}
