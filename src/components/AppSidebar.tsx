import { Link, linkOptions, useMatchRoute } from '@tanstack/react-router'
import {
  AnchorIcon,
  CalendarIcon,
  FolderIcon,
  LogOutIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
} from 'lucide-react'
import { ModeToggle } from '~/components/ModeToggle'
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
import { useSignOut } from '~/lib/authClient'

type SidebarUser = {
  role?: string | null
}

const mainNavItems = linkOptions([
  { to: '/', label: 'Kalender', icon: CalendarIcon },
  { to: '/owners', label: 'Delägare', icon: UsersIcon },
  { to: '/documents', label: 'Dokument', icon: FolderIcon },
])

const adminNavItems = linkOptions([
  { to: '/admin/shares', label: 'Andelar', icon: AnchorIcon },
  { to: '/admin/documents/bin', label: 'Papperskorg', icon: Trash2Icon },
])

type NavItem = (typeof mainNavItems)[number] | (typeof adminNavItems)[number]

export function AppSidebar({ user }: { user: SidebarUser }) {
  const matchRoute = useMatchRoute()
  const { setOpenMobile } = useSidebar()
  const signOut = useSignOut()

  const isAdmin = user.role === 'admin'

  function renderItem(item: NavItem) {
    const isActive = !!matchRoute({ to: item.to, fuzzy: true })
    return (
      <SidebarMenuItem key={item.to}>
        <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
          <Link to={item.to} onClick={() => setOpenMobile(false)}>
            <item.icon />
            <span>{item.label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar collapsible="icon">
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
        <Button variant="outline" size="icon" asChild aria-label="Konto">
          <Link to="/account" onClick={() => setOpenMobile(false)}>
            <UserIcon />
          </Link>
        </Button>
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
