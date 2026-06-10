import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { orpc } from '~/lib/orpc/client'
import { initials } from '~/lib/utils'
import { m } from '~/paraglide/messages'

export function AccountAvatarLink({ onClick }: { onClick?: () => void }) {
  const { data: me } = useSuspenseQuery(orpc.user.me.queryOptions())
  const fallback = me.name.trim() ? initials(me.name) : (me.email[0]?.toUpperCase() ?? '?')

  return (
    <Link
      to="/account"
      onClick={onClick}
      aria-label={m.nav_account()}
      className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Avatar className="size-9">
        {me.image ? (
          <AvatarImage
            src={me.image}
            alt={me.name}
            width={36}
            height={36}
            blurhash={me.imageBlurhash}
          />
        ) : null}
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
    </Link>
  )
}
