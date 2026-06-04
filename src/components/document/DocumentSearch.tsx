import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { FileIcon, FolderIcon, SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '~/components/ui/button'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command'
import { orpc } from '~/lib/orpc/client'

/**
 * One-input natural-language search (ADR-0010): no filters, no syntax. Folder
 * hits navigate into the folder; document hits open the download. Server-side
 * trigram search, so cmdk's client filtering is disabled (`shouldFilter`).
 */
export function DocumentSearch() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const { data: hits = [], isFetching } = useQuery({
    ...orpc.documentSearch.search.queryOptions({ input: { q: debounced } }),
    enabled: open && debounced.length >= 2,
  })

  const folders = hits.filter((h) => h.kind === 'folder')
  const documents = hits.filter((h) => h.kind === 'document')

  return (
    <>
      <Button
        variant="outline"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label="Sök dokument"
      >
        <SearchIcon data-icon="inline-start" />
        Sök…
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Sök dokument"
        description="Sök efter mappar och dokument"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Sök efter mappar och dokument…"
          />
          <CommandList>
            {debounced.length >= 2 && !isFetching && hits.length === 0 ? (
              <CommandEmpty>Inga träffar.</CommandEmpty>
            ) : null}
            {folders.length > 0 ? (
              <CommandGroup heading="Mappar">
                {folders.map((hit) => (
                  <CommandItem
                    key={`folder:${hit.id}`}
                    value={`folder:${hit.id}`}
                    onSelect={() => {
                      setOpen(false)
                      void navigate({ to: '/documents', search: { folder: hit.id } })
                    }}
                  >
                    <FolderIcon data-icon="inline-start" />
                    <span className="truncate">{hit.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {documents.length > 0 ? (
              <CommandGroup heading="Dokument">
                {documents.map((hit) => (
                  <CommandItem
                    key={`document:${hit.id}`}
                    value={`document:${hit.id}`}
                    onSelect={() => {
                      setOpen(false)
                      window.open(`/api/files/download/${hit.id}`, '_blank', 'noopener,noreferrer')
                    }}
                  >
                    <FileIcon data-icon="inline-start" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{hit.name}</span>
                      {hit.path ? (
                        <span className="truncate text-muted-foreground text-xs">{hit.path}</span>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
