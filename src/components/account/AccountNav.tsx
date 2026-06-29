import { Link, useMatchRoute } from '@tanstack/react-router'
import { ShieldIcon, UserRoundIcon } from 'lucide-react'
import { cn } from '~/lib/utils'
import { m } from '~/paraglide/messages'

// Inner navigation for the Account section: a left rail on desktop, a segmented
// control on top on mobile. Built on routed `Link`s (not ToggleGroup) so each
// item is a real anchor with active-route awareness, prefetch, and SSR markup.
// `label` stores the message *function* and is called at render — module scope
// outlives the request locale (see CLAUDE.md i18n note).
const items = [
  { to: '/account/profile', label: m.account_nav_profile, icon: UserRoundIcon },
  { to: '/account/security', label: m.account_nav_security, icon: ShieldIcon },
] as const

// Inactive item: centered + flex-1 inside the mobile segmented control; left
// aligned and full-width in the desktop rail.
const itemClass =
  'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground md:flex-none md:justify-start md:py-2 md:font-normal md:hover:bg-accent/50'

// Active item: a raised pill on the mobile segmented control; a tinted row in
// the desktop rail. Merged into itemClass via cn() (tailwind-merge) so the
// colour/weight conflicts resolve deterministically — Link's activeProps would
// just concatenate the strings and leave the winner to CSS source order.
const activeClass =
  'bg-background text-foreground shadow-sm md:bg-accent md:text-accent-foreground md:font-medium md:shadow-none'

export function AccountNav({ className }: { className?: string }) {
  const matchRoute = useMatchRoute()
  return (
    <nav
      aria-label={m.account_title()}
      className={cn(
        'flex gap-1 rounded-lg border bg-muted/40 p-1 md:flex-col md:rounded-none md:border-0 md:bg-transparent md:p-0',
        className,
      )}
    >
      {items.map((item) => {
        const isActive = !!matchRoute({ to: item.to })
        return (
          <Link key={item.to} to={item.to} className={cn(itemClass, isActive && activeClass)}>
            <item.icon className="size-4 shrink-0" />
            <span>{item.label()}</span>
          </Link>
        )
      })}
    </nav>
  )
}
