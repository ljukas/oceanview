import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ContactCard } from '~/components/contact/ContactCard'
import { orpc } from '~/lib/orpc/client'

export const Route = createFileRoute('/_authenticated/contacts')({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(orpc.user.listContacts.queryOptions()),
      queryClient.ensureQueryData(orpc.presence.listOnline.queryOptions()),
    ]),
  component: Contacts,
})

function Contacts() {
  const { user: currentUser } = Route.useRouteContext()
  const { data: contacts } = useSuspenseQuery(orpc.user.listContacts.queryOptions())
  const { data: onlineIds } = useSuspenseQuery(orpc.presence.listOnline.queryOptions())
  const onlineSet = new Set(onlineIds)

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">Kontakter</h1>

      {contacts.length === 0 ? (
        <div className="rounded-lg border bg-card py-8 text-center text-muted-foreground text-sm">
          Inga kontakter hittades.
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          {contacts.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              isSelf={c.id === currentUser.id}
              isOnline={onlineSet.has(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
