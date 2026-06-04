import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Field, FieldLabel } from '~/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { orpc } from '~/lib/orpc/client'

const ROOT_VALUE = '__root__'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  // What is being moved. A document can land anywhere; a folder cannot land in
  // its own subtree (excluded below; the service also guards).
  target: { kind: 'document' | 'folder'; id: string; name: string }
}

export function MoveDialog({ open, onOpenChange, target }: Props) {
  const queryClient = useQueryClient()
  const { data: folders } = useSuspenseQuery(orpc.folder.tree.queryOptions())
  const [destination, setDestination] = useState<string>(ROOT_VALUE)

  const onSuccess = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.folder.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.document.key() }),
    ])
    toast.success('Flyttad')
    onOpenChange(false)
  }
  const onError = (err: Error) => toast.error(err.message || 'Kunde inte flytta')

  const moveDocument = useMutation(
    orpc.document.moveDocument.mutationOptions({ onSuccess, onError }),
  )
  const moveFolder = useMutation(orpc.folder.moveFolder.mutationOptions({ onSuccess, onError }))
  const isPending = moveDocument.isPending || moveFolder.isPending

  // For a folder move, hide the folder itself and its descendants (path prefix).
  const self = target.kind === 'folder' ? folders.find((f) => f.id === target.id) : undefined
  const options = folders.filter(
    (f) => !self || (f.id !== self.id && !f.path.startsWith(self.path)),
  )

  function submit() {
    const folderId = destination === ROOT_VALUE ? null : destination
    if (target.kind === 'document') {
      moveDocument.mutate({ id: target.id, folderId })
    } else {
      moveFolder.mutate({ id: target.id, newParentId: folderId })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Flytta "{target.name}"</DialogTitle>
          <DialogDescription>Välj målmapp.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="move-destination">Målmapp</FieldLabel>
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger id="move-destination">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ROOT_VALUE}>Alla dokument (rot)</SelectItem>
                {options.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.path}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Avbryt
          </Button>
          <Button onClick={submit} disabled={isPending}>
            Flytta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
