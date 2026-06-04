import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { FileIcon, FolderIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty'
import type { RouterOutputs } from '~/lib/orpc/client'
import { orpc } from '~/lib/orpc/client'

type BinEntry = RouterOutputs['bin']['list'][number]

const dateTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function useBinInvalidate() {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.bin.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.document.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.folder.key() }),
    ])
  }
}

export function DocumentBin() {
  const { data: entries } = useSuspenseQuery(orpc.bin.list.queryOptions())

  // Cascade deletes share a correlationId → one restorable batch. Documents
  // deleted individually carry no correlationId → restore/purge per document.
  const batches = new Map<string, Array<BinEntry>>()
  const loose: Array<BinEntry> = []
  for (const entry of entries) {
    if (entry.correlationId) {
      const list = batches.get(entry.correlationId) ?? []
      list.push(entry)
      batches.set(entry.correlationId, list)
    } else {
      loose.push(entry)
    }
  }

  if (entries.length === 0) {
    return (
      <Empty className="rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Trash2Icon />
          </EmptyMedia>
          <EmptyTitle>Papperskorgen är tom</EmptyTitle>
          <EmptyDescription>Borttagna mappar och dokument hamnar här.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {[...batches.entries()].map(([correlationId, items]) => (
        <BatchCard key={correlationId} correlationId={correlationId} items={items} />
      ))}
      {loose.map((entry) => (
        <LooseRow key={`${entry.kind}:${entry.id}`} entry={entry} />
      ))}
    </div>
  )
}

function BatchCard({ correlationId, items }: { correlationId: string; items: Array<BinEntry> }) {
  const invalidate = useBinInvalidate()
  const folderCount = items.filter((i) => i.kind === 'folder').length
  const documentCount = items.filter((i) => i.kind === 'document').length
  const deletedAt = items[0]?.deletedAt

  const restore = useMutation(
    orpc.folder.restoreFolder.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        toast.success('Återställd')
      },
      onError: (err) => toast.error(err.message || 'Kunde inte återställa'),
    }),
  )

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-medium text-sm">
          Borttagen mapp ({folderCount} {folderCount === 1 ? 'mapp' : 'mappar'}, {documentCount}{' '}
          dokument)
        </span>
        {deletedAt ? (
          <span className="text-muted-foreground text-xs">
            {dateTimeFormatter.format(deletedAt)}
          </span>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => restore.mutate({ correlationId })}
        disabled={restore.isPending}
      >
        <RotateCcwIcon data-icon="inline-start" />
        Återställ
      </Button>
    </div>
  )
}

function LooseRow({ entry }: { entry: BinEntry }) {
  const invalidate = useBinInvalidate()
  const [confirmHard, setConfirmHard] = useState(false)

  const restore = useMutation(
    orpc.document.restoreDocument.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        toast.success('Dokumentet återställdes')
      },
      onError: (err) => toast.error(err.message || 'Kunde inte återställa'),
    }),
  )
  const hardDelete = useMutation(
    orpc.bin.hardDeleteDocument.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        toast.success('Dokumentet raderades permanent')
        setConfirmHard(false)
      },
      onError: (err) => toast.error(err.message || 'Kunde inte radera'),
    }),
  )

  const isFolder = entry.kind === 'folder'

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4">
      <div className="flex min-w-0 items-center gap-2">
        {isFolder ? (
          <FolderIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <FileIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-sm">{entry.name}</span>
          <span className="text-muted-foreground text-xs">
            {dateTimeFormatter.format(entry.deletedAt)}
          </span>
        </div>
        {isFolder ? <Badge variant="secondary">Mapp</Badge> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Folder restore here is rare (folders normally arrive in a batch); the
            restore-by-correlation path covers cascades. A lone folder has no
            correlation to restore, so only documents get actions. */}
        {!isFolder ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => restore.mutate({ id: entry.id })}
              disabled={restore.isPending}
            >
              <RotateCcwIcon data-icon="inline-start" />
              Återställ
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Radera permanent"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmHard(true)}
            >
              <Trash2Icon />
            </Button>
          </>
        ) : null}
      </div>

      <AlertDialog open={confirmHard} onOpenChange={setConfirmHard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Radera "{entry.name}" permanent?</AlertDialogTitle>
            <AlertDialogDescription>
              Filen tas bort för gott och kan inte återställas. Historiken bevaras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmHard(false)}
              disabled={hardDelete.isPending}
            >
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={() => hardDelete.mutate({ id: entry.id })}
              disabled={hardDelete.isPending}
            >
              Radera permanent
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
