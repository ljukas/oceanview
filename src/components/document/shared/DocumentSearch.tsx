import { formatForDisplay, useHotkey } from '@tanstack/react-hotkeys'
import { useDebouncedValue } from '@tanstack/react-pacer'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { FolderIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fileTypeAppearance, folderPathToSplat } from '~/components/document/shared/documentHelpers'
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
import { m } from '~/paraglide/messages'

/**
 * One-input natural-language search (ADR-0010): no filters, no syntax. Folder
 * hits navigate into the folder; document hits open the download. Server-side
 * trigram search, so cmdk's client filtering is disabled (`shouldFilter`).
 */
export function DocumentSearch() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // `query` drives the controlled input immediately; Pacer derives `debounced`
  // from it 250ms after the last keystroke (trailing edge) and gates the server
  // search — no extra state, manual timer, or cleanup to hand-roll.
  const [debounced] = useDebouncedValue(query, { wait: 250 })
  // cmdk keeps the previously selected item highlighted across searches and
  // scrolls it into view, leaving a new result set mid-scroll. We control the
  // selected value and clear it on every edit (in the input's onValueChange)
  // so cmdk re-picks the first item and scrolls *that* (the top) into view.
  const [selected, setSelected] = useState('')
  // formatForDisplay reads navigator, so resolve the label after mount to avoid
  // an SSR/client hydration mismatch (empty until then → kbd hint not rendered).
  const [hotkeyLabel, setHotkeyLabel] = useState('')

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
    // Keep the previous hits on screen while a new query loads so results (or
    // the explanation) don't flash blank between keystrokes.
    placeholderData: keepPreviousData,
  })

  // Folder hits carry a non-null `path`; navigation goes through the readable
  // `/documents/$` splat rather than the folder id (the predicate narrows so).
  const folders = hits.filter((h) => h.kind === 'folder')
  const documents = hits.filter((h) => h.kind === 'document')

  // "Inga träffar." only after a search settles with zero hits. The explanation
  // covers everything else with no hits yet — short query *and* in-flight first
  // search — so it stays visible until results arrive instead of blanking out.
  const showNoResults = debounced.length >= 2 && !isFetching && hits.length === 0
  const showExplanation = hits.length === 0 && !showNoResults

  return (
    <>
      <Button
        variant="outline"
        className="w-full justify-start gap-2 text-muted-foreground sm:w-72"
        onClick={() => setOpen(true)}
        aria-label={m.search_documents_label()}
      >
        <SearchIcon data-icon="inline-start" />
        <span className="flex-1 text-left">{m.search_placeholder_short()}</span>
        {hotkeyLabel ? (
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
            {hotkeyLabel}
          </kbd>
        ) : null}
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={m.search_documents_label()}
        description={m.search_documents_description()}
        className="sm:max-w-xl"
      >
        <Command shouldFilter={false} value={selected} onValueChange={setSelected}>
          <CommandInput
            value={query}
            onValueChange={(value) => {
              setQuery(value)
              // Clearing makes cmdk re-pick (and scroll to) the first item once
              // the new result set lands — see the `selected` comment above.
              setSelected('')
            }}
            placeholder={m.search_input_placeholder()}
            loading={isFetching}
          />
          <CommandList>
            {showExplanation ? (
              <div className="px-4 py-10 text-center">
                <p className="font-medium text-base">{m.search_documents_description()}</p>
                <p className="mt-1 text-muted-foreground text-sm">{m.search_hint()}</p>
              </div>
            ) : null}
            {showNoResults ? <CommandEmpty>{m.search_no_results()}</CommandEmpty> : null}
            {folders.length > 0 ? (
              <CommandGroup heading={m.search_group_folders()}>
                {folders.map((hit) => (
                  <CommandItem
                    key={`folder:${hit.id}`}
                    value={`folder:${hit.id}`}
                    onSelect={() => {
                      setOpen(false)
                      void navigate({
                        to: '/documents/$',
                        params: { _splat: folderPathToSplat(hit.path ?? '') },
                      })
                    }}
                  >
                    <FolderIcon data-icon="inline-start" />
                    <span className="truncate">{hit.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {documents.length > 0 ? (
              <CommandGroup heading={m.search_group_documents()}>
                {documents.map((hit) => {
                  const { Icon, className } = fileTypeAppearance({
                    mime: hit.mime,
                    extension: hit.extension,
                  })
                  return (
                    <CommandItem
                      key={`document:${hit.id}`}
                      value={`document:${hit.id}`}
                      onSelect={() => {
                        setOpen(false)
                        window.open(
                          `/api/files/download/${hit.id}`,
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }}
                    >
                      <Icon data-icon="inline-start" className={className} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{hit.name}</span>
                        {hit.path ? (
                          <span className="truncate text-muted-foreground text-sm">{hit.path}</span>
                        ) : null}
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
