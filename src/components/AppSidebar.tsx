import { Link, linkOptions, useMatchRoute } from '@tanstack/react-router'
import {
  AnchorIcon,
  CalendarIcon,
  FolderIcon,
  LogOutIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react'
import { LocaleSwitcher } from '~/components/LocaleSwitcher'
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
import { AccountAvatarLink } from '~/components/user/AccountAvatarLink'
import { useSignOut } from '~/lib/authClient'
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
  const { setOpenMobile, isMobile } = useSidebar()
  const signOut = useSignOut()

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
      <SidebarFooter className="flex flex-row items-center gap-2 p-4">
        {/* On mobile these live in the header next to the hamburger */}
        {isMobile ? null : (
          <>
            <ModeToggle />
            <LocaleSwitcher />
            <AccountAvatarLink onClick={() => setOpenMobile(false)} />
          </>
        )}
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            void signOut()
          }}
        >
          <LogOutIcon />
          <span>{m.nav_sign_out()}</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
