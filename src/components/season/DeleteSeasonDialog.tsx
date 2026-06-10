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
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.season.key() })
        toast.success(m.season_deleted())
        onDone()
      },
      onError: (err) => {
        toast.error(err.message || m.season_delete_error())
      },
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
            deleteMutation.mutate({ year })
          }}
        >
          {deleteMutation.isPending && <Spinner data-icon="inline-start" />}
          {m.common_delete()}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
