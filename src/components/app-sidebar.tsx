import { Link, useMatchRoute } from '@tanstack/react-router'
import { CalendarIcon, ContactIcon, FolderIcon, LogOutIcon, UsersIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { ModeToggle } from '~/components/mode-toggle'
import { Button } from '~/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '~/components/ui/sidebar'
import { useSignOut } from '~/lib/auth-client'

type SidebarUser = {
  role?: string | null
}

type NavItem = {
  to: '/' | '/contacts' | '/documents' | '/admin/users'
  label: string
  icon: ComponentType<{ className?: string }>
}

const mainNavItems: Array<NavItem> = [
  { to: '/', label: 'Kalender', icon: CalendarIcon },
  { to: '/contacts', label: 'Kontakter', icon: ContactIcon },
  { to: '/documents', label: 'Dokument', icon: FolderIcon },
]

const adminNavItems: Array<NavItem> = [{ to: '/admin/users', label: 'Användare', icon: UsersIcon }]

export function AppSidebar({ user }: { user: SidebarUser }) {
  const matchRoute = useMatchRoute()
  const { setOpenMobile } = useSidebar()
  const signOut = useSignOut()

  const isAdmin = user.role === 'admin'

  function renderItem(item: NavItem) {
    const isActive = !!matchRoute({ to: item.to, fuzzy: true })
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
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-4 py-4">
        <span className="font-semibold text-lg">Oceanview</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">{mainNavItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">{adminNavItems.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter className="flex flex-row items-center gap-2 p-4">
        <ModeToggle />
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            void signOut()
          }}
        >
          <LogOutIcon />
          <span>Logga ut</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
