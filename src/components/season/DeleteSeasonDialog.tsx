import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { Spinner } from '~/components/ui/spinner'
import { orpc } from '~/lib/orpc/client'
import { optimisticRemove } from '~/lib/orpc/optimistic'
import { m } from '~/paraglide/messages'

type Props = {
  open: boolean
  year?: number
  onOpenChange: (open: boolean) => void
}

export function DeleteSeasonDialog({ open, year, onOpenChange }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {year !== undefined ? (
          <DeleteSeasonBody key={year} year={year} onDone={() => onOpenChange(false)} />
        ) : (
          <DeleteSeasonFallback />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteSeasonFallback() {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{m.season_delete_title()}</AlertDialogTitle>
        <AlertDialogDescription>{m.common_loading()}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
      </AlertDialogFooter>
    </>
  )
}

function DeleteSeasonBody({ year, onDone }: { year: number; onDone: () => void }) {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation(
    orpc.season.delete.mutationOptions({
      // Drop the year row from the schedule grid before the round-trip; the row
      // vanishing is the confirmation, so there's no success toast.
      onMutate: ({ year }) =>
        optimisticRemove(queryClient, orpc.season.listSchedules.queryKey(), (s) => s.year === year),
      // onError/onSettled live on useMutation (not the mutate call) so they still
      // run after the instant close below. onSettled re-syncs the grid, reverting
      // the optimistic removal on failure. season.delete declares no typed errors,
      // so a generic toast is all there is to map.
      onError: () => {
        toast.error(m.season_delete_error())
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.season.key() }),
    }),
  )

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{m.season_delete_title()}</AlertDialogTitle>
        <AlertDialogDescription>{m.season_delete_confirm({ year })}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={deleteMutation.isPending}>
          {m.common_cancel()}
        </AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={deleteMutation.isPending}
          onClick={(e) => {
            e.preventDefault()
            // Optimistic instant-close: onMutate drops the row, we close now, and
            // onError/onSettled reconcile in the background.
            deleteMutation.mutate({ year })
            onDone()
          }}
        >
          {deleteMutation.isPending && <Spinner data-icon="inline-start" />}
          {m.common_delete()}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
