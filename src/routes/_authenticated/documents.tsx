import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/documents')({
  component: Documents,
})

function Documents() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold">Dokument</h1>
    </div>
  )
}
