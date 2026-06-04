import { formatForDisplay, useHotkey } from '@tanstack/react-hotkeys'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { FileIcon, FolderIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
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
  // formatForDisplay reads navigator, so resolve the label after mount to avoid
  // an SSR/client hydration mismatch (empty until then → kbd hint not rendered).
  const [hotkeyLabel, setHotkeyLabel] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    setHotkeyLabel(formatForDisplay('Mod+K'))
  }, [])

  // Cmd/Ctrl+K is the universal command-palette default. `Mod` resolves to ⌘ on
  // macOS, Ctrl elsewhere, and preventDefault is on by default.
  const toggle = useCallback(() => setOpen((o) => !o), [])
  useHotkey('Mod+K', toggle)

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
        className="w-full justify-start gap-2 text-muted-foreground sm:w-72"
        onClick={() => setOpen(true)}
        aria-label="Sök dokument"
      >
        <SearchIcon data-icon="inline-start" />
        <span className="flex-1 text-left">Sök…</span>
        {hotkeyLabel ? (
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
            {hotkeyLabel}
          </kbd>
        ) : null}
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
