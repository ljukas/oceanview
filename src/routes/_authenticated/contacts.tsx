import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/contacts')({
  component: Contacts,
})

function Contacts() {
  return (
    <div className="p-4">
      <h1 className="font-semibold text-2xl">Kontakter</h1>
    </div>
  )
}
