import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/contacts')({
  component: Contacts,
})

function Contacts() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold">Kontakter</h1>
    </div>
  )
}
