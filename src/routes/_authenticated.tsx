import { environmentManager } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppSidebar } from '~/components/AppSidebar'
import { CommandPalette } from '~/components/command/CommandPalette'
import { CommandTriggerButton } from '~/components/command/CommandTriggerButton'
import { CommandPaletteProvider } from '~/components/command/useCommandPalette'
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
    <CommandPaletteProvider>
      <UploadQueueProvider>
        <TooltipProvider>
          <SidebarProvider className="h-svh overflow-hidden">
            <AppSidebar user={user} />
            <SidebarInset className="min-h-0 overflow-hidden">
              <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-background px-4 md:hidden">
                <SidebarTrigger />
                <div className="flex flex-1 justify-center px-3">
                  <CommandTriggerButton className="max-w-xs" />
                </div>
                <HeaderUserMenu />
              </header>
              <Outlet />
            </SidebarInset>
            <CommandPalette role={user.role} />
          </SidebarProvider>
        </TooltipProvider>
        <UploadQueueBox />
      </UploadQueueProvider>
    </CommandPaletteProvider>
  )
}
