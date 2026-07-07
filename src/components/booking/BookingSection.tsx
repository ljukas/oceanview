import { isDefinedError } from '@orpc/client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LockIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group'
import { formatDate } from '~/lib/i18n/format'
import { bookingErrorMessage } from '~/lib/orpc/bookingErrorMessage'
import { orpc } from '~/lib/orpc/client'
import { optimisticReplace } from '~/lib/orpc/optimistic'
import type { ShareCode } from '~/lib/shares/codes'
import { m } from '~/paraglide/messages'
import { BookingCards } from './BookingCards'
import { BookingStrip } from './BookingStrip'
import { type BookingData, buildStripBlocks, type StripBlock } from './stripModel'

type BookingSectionProps = {
  data: BookingData
  isAdmin: boolean
  ownedShareCodes: ReadonlySet<ShareCode>
}

// The booking round above the Disponeringslista (ADR-0020): "convention
// below, reality above". Owners toggle wishes while open; the locked view
// shows everyone's final weeks. Admin arranging/locking is layered on in
// plan 06.
export function BookingSection({ data, isAdmin, ownedShareCodes }: BookingSectionProps) {
  const queryClient = useQueryClient()
  const myShares = useMemo(() => [...ownedShareCodes].sort(), [ownedShareCodes])
  // Derived during render, not seeded state: if the selected share disappears
  // (unassigned mid-round + realtime refresh), fall back to the first owned
  // share instead of acting as a share the user no longer holds.
  const [selectedShare, setSelectedShare] = useState<ShareCode | null>(null)
  const actingShare =
    selectedShare !== null && myShares.includes(selectedShare)
      ? selectedShare
      : (myShares[0] ?? null)
  const locked = data.lockedAt !== null

  const activeKey = orpc.booking.getActive.queryKey()

  // Optimistic instant toggles (standing mutation rules): paint in onMutate,
  // reconcile via invalidate in onSettled, callbacks in mutationOptions so
  // they survive any unmount; no success toast — the paint is the
  // confirmation.
  const addWishMutation = useMutation(
    orpc.booking.addWish.mutationOptions({
      onMutate: (vars) =>
        optimisticReplace(queryClient, activeKey, (old) => ({
          ...old,
          wishes: [
            ...old.wishes,
            {
              id: `optimistic-${vars.shareCode}-${vars.targetKind}-${vars.targetShare ?? ''}`,
              ...vars,
            },
          ],
        })),
      onError: (err) =>
        toast.error(
          isDefinedError(err) ? bookingErrorMessage(err.code) : m.booking_error_generic(),
        ),
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.booking.key() }),
    }),
  )

  const removeWishMutation = useMutation(
    orpc.booking.removeWish.mutationOptions({
      onMutate: (vars) =>
        optimisticReplace(queryClient, activeKey, (old) => ({
          ...old,
          wishes: old.wishes.filter(
            (w) =>
              !(
                w.shareCode === vars.shareCode &&
                w.targetKind === vars.targetKind &&
                w.targetShare === vars.targetShare
              ),
          ),
        })),
      onError: (err) =>
        toast.error(
          isDefinedError(err) ? bookingErrorMessage(err.code) : m.booking_error_generic(),
        ),
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.booking.key() }),
    }),
  )

  const stripBlocks = useMemo(
    () => buildStripBlocks(data, actingShare, ownedShareCodes, data.lockedSchedule),
    [data, actingShare, ownedShareCodes],
  )

  const interactive = !locked && actingShare !== null

  const onBlockClick = (block: StripBlock) => {
    if (!interactive || !actingShare || block.target.targetShare === actingShare) return
    const vars = { shareCode: actingShare, ...block.target }
    if (block.myWish) removeWishMutation.mutate(vars)
    else addWishMutation.mutate(vars)
  }

  const myLockedRanges = useMemo(
    () =>
      (data.lockedSchedule ?? [])
        .filter((s) => s.holder !== null && ownedShareCodes.has(s.holder))
        .map((s) => `${s.firstWeek}–${s.lastWeek}`),
    [data.lockedSchedule, ownedShareCodes],
  )

  const stripProps = {
    year: data.year,
    monthBands: data.monthBands,
    blocks: stripBlocks,
    actingShare,
    showWishes: !locked,
    interactive,
    onBlockClick,
    selectedWeek: null,
    arrange: null,
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-heading font-semibold text-lg tracking-tight">
          {m.booking_title({ year: data.year })}
        </h2>
        {data.lockedAt ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs">
            <LockIcon className="size-3" aria-hidden />
            {m.booking_status_locked({ date: formatDate(data.lockedAt) })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 font-medium text-brand text-xs">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden />
            {m.booking_status_open()}
          </span>
        )}
        {/* plan 06: admin controls (Ordna / Lås säsong; Lås upp in the locked chip) mount here */}
      </div>
      {!locked && myShares.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{m.booking_wish_as()}</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={actingShare ?? undefined}
            onValueChange={(value) => value && setSelectedShare(value as ShareCode)}
          >
            {myShares.map((code) => (
              <ToggleGroupItem key={code} value={code} className="px-3 tabular-nums">
                {code}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      <BookingStrip {...stripProps} />
      <BookingCards {...stripProps} />
      {!locked && myShares.length > 0 && (
        <p className="text-muted-foreground text-sm">{m.booking_helper_owner()}</p>
      )}
      {locked && myLockedRanges.length > 0 && (
        <p className="text-sm">
          {m.booking_locked_my_weeks({ year: data.year, weeks: myLockedRanges.join(' + ') })}
        </p>
      )}
    </section>
  )
}
