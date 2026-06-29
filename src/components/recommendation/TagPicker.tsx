import { useQuery } from '@tanstack/react-query'
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group'
import { orpc } from '~/lib/orpc/client'
import { isTagSlug, tagLabels } from './tagLabels'

// Multi-select over the fixed, seeded tag set. `value`/`onChange` carry tag IDs
// (what create/update want); labels come from tagLabels[slug](). Tags are loaded
// in the route loader, so this query is warm.
export function TagPicker({
  value,
  onChange,
}: {
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const { data: tags } = useQuery(orpc.tag.list.queryOptions())
  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      value={value}
      onValueChange={onChange}
      className="flex flex-wrap justify-start gap-2"
    >
      {(tags ?? []).map((t) => (
        <ToggleGroupItem key={t.id} value={t.id} className="rounded-full">
          {isTagSlug(t.slug) ? tagLabels[t.slug]() : t.slug}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
