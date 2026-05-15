import { Link, useMatchRoute, useRouter } from '@tanstack/react-router'
import {
  CalendarIcon,
  FolderIcon,
  LogOutIcon,
  UsersIcon,
} from 'lucide-react'
import { ModeToggle } from '~/components/mode-toggle'
import { Button } from '~/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '~/components/ui/sidebar'
import { authClient } from '~/lib/auth-client'

type NavItem = {
  to: '/' | '/contacts' | '/documents'
  label: string
  icon: typeof CalendarIcon
}

const navItems: Array<NavItem> = [
  { to: '/', label: 'Kalender', icon: CalendarIcon },
  { to: '/contacts', label: 'Kontakter', icon: UsersIcon },
  { to: '/documents', label: 'Dokument', icon: FolderIcon },
]

export function AppSidebar() {
  const router = useRouter()
  const matchRoute = useMatchRoute()
  const { setOpenMobile } = useSidebar()

  async function onSignOut() {
    await authClient.signOut()
    await router.invalidate()
    await router.navigate({ to: '/login' })
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-4 py-4">
        <span className="text-lg font-semibold">Oceanview</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navItems.map((item) => {
                const isActive = !!matchRoute({ to: item.to })
                console.log(matchRoute({ to: item.to }))
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link to={item.to} onClick={() => setOpenMobile(false)}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="flex flex-row items-center gap-2 p-4">
        <ModeToggle />
        <Button
          variant="outline"
          className="flex-1"
          onClick={onSignOut}
        >
          <LogOutIcon />
          <span>Logga ut</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
