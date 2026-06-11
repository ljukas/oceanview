import { Link, linkOptions, useMatchRoute } from '@tanstack/react-router'
import { AnchorIcon, CalendarIcon, FolderIcon, Trash2Icon, UsersIcon } from 'lucide-react'
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
import { SidebarUserMenu } from '~/components/user/UserMenu'
import { m } from '~/paraglide/messages'

type SidebarUser = {
  role?: string | null
}

// label is a message function rather than a string: module scope evaluates
// once per process, but the active locale is per request/render.
const mainNavItems = linkOptions([
  { to: '/', label: m.nav_calendar, icon: CalendarIcon },
  { to: '/owners', label: m.nav_owners, icon: UsersIcon },
  { to: '/documents', label: m.nav_documents, icon: FolderIcon },
])

const adminNavItems = linkOptions([
  { to: '/admin/shares', label: m.nav_shares, icon: AnchorIcon },
  { to: '/admin/documents/bin', label: m.nav_bin, icon: Trash2Icon },
])

type NavItem = (typeof mainNavItems)[number] | (typeof adminNavItems)[number]

export function AppSidebar({ user }: { user: SidebarUser }) {
  const matchRoute = useMatchRoute()
  const { setOpenMobile } = useSidebar()

  const isAdmin = user.role === 'admin'

  function renderItem(item: NavItem) {
    const isActive = !!matchRoute({ to: item.to, fuzzy: true })
    return (
      <SidebarMenuItem key={item.to}>
        <SidebarMenuButton asChild isActive={isActive} tooltip={item.label()}>
          <Link to={item.to} onClick={() => setOpenMobile(false)}>
            <item.icon />
            <span>{item.label()}</span>
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
            <SidebarGroupLabel>{m.nav_admin_group()}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">{adminNavItems.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      {/* Hidden below md: the mobile header already shows HeaderUserMenu,
          so the drawer would duplicate it. */}
      <SidebarFooter className="hidden md:flex">
        <SidebarMenu>
          <SidebarUserMenu />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
