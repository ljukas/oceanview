import type { DataTag, QueryClient, QueryKey } from '@tanstack/react-query'

// Optimistic cache helpers for list queries: paint a mutation into the cache
// before the server round-trip, so in-place lists (document table, bin) react
// instantly. Reconciliation is the caller's job — invalidate the namespace in
// `onSettled` so both success and error re-sync from the server (which also
// rolls a failed optimistic patch back). See ADR-0004 for the realtime
// invalidate that sits behind these as a second safety net.
//
// The `queryKey` param is a `DataTag`-branded orpc key (`orpc.x.y.queryKey(...)`),
// so the element type `T` is *inferred from the key* — `getQueryData`/`setQueryData`
// stay fully typed with no generic argument and no cast.

/** Optimistically drop matching items from a cached list before the round-trip. */
export async function optimisticRemove<T, TError = unknown>(
  queryClient: QueryClient,
  queryKey: DataTag<QueryKey, Array<T>, TError>,
  match: (item: T) => boolean,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey })
  queryClient.setQueryData(queryKey, (old) => old?.filter((item) => !match(item)) ?? old)
}

/** Optimistically patch matching items in a cached list before the round-trip. */
export async function optimisticPatch<T, TError = unknown>(
  queryClient: QueryClient,
  queryKey: DataTag<QueryKey, Array<T>, TError>,
  match: (item: T) => boolean,
  patch: (item: T) => T,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey })
  queryClient.setQueryData(
    queryKey,
    (old) => old?.map((item) => (match(item) ? patch(item) : item)) ?? old,
  )
}
