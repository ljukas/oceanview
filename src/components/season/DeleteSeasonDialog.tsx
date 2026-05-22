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

type Props = {
  open: boolean
  year?: number
  onOpenChange: (open: boolean) => void
}

const TITLE = 'Ta bort säsong?'

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
        <AlertDialogTitle>{TITLE}</AlertDialogTitle>
        <AlertDialogDescription>Laddar…</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Avbryt</AlertDialogCancel>
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
        toast.success('Säsongen togs bort')
        onDone()
      },
      onError: (err) => {
        toast.error(err.message || 'Kunde inte ta bort säsongen')
      },
    }),
  )

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{TITLE}</AlertDialogTitle>
        <AlertDialogDescription>
          {`Säsong ${year} och dess fördelning av andelar tas bort. Detta går inte att ångra.`}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={deleteMutation.isPending}>Avbryt</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={deleteMutation.isPending}
          onClick={(e) => {
            e.preventDefault()
            deleteMutation.mutate({ year })
          }}
        >
          {deleteMutation.isPending && <Spinner data-icon="inline-start" />}
          Ta bort
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
