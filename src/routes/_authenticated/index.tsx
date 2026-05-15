import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/')({
  component: Calendar,
})

function Calendar() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold">Kalender</h1>
    </div>
  )
}
