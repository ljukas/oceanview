import { isDefinedError } from '@orpc/client'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { backOff } from 'exponential-backoff'
import { useEffect, useRef } from 'react'
import { useActivityGate } from '~/hooks/useActivityGate'
import type { RealtimeEvent } from '~/lib/effects'
import { logger } from '~/lib/logger/browser'
import { client, orpc } from '~/lib/orpc/client'

type RealtimeEventKind = RealtimeEvent['kind']

function dispatch(queryClient: QueryClient, kind: RealtimeEventKind) {
  switch (kind) {
    case 'user.changed':
      void queryClient.invalidateQueries({ queryKey: orpc.user.key() })
      return
    case 'presence.changed':
      void queryClient.invalidateQueries({ queryKey: orpc.presence.key() })
      return
    case 'share.changed':
      void queryClient.invalidateQueries({ queryKey: orpc.share.key() })
      // The Delägare table renders owned shares; keep that view in sync.
      void queryClient.invalidateQueries({ queryKey: orpc.user.listContacts.key() })
      return
    case 'document.changed':
      // Invalidate the document *list* and history, never the whole namespace:
      // `document.thumbnail` is served from a stable public URL and must not be
      // refetched (it would reload every tile). A newly-rendered thumbnail is
      // picked up naturally — the list refetch surfaces its `thumbnailPathname`,
      // which enables the tile's (first) thumbnail fetch.
      void queryClient.invalidateQueries({ queryKey: orpc.document.listDocuments.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.document.documentHistory.key() })
      // Uploads/renames/deletes add, rewrite, or remove search haystacks, so an
      // open search palette must refetch too (same reasoning as folder.changed).
      void queryClient.invalidateQueries({ queryKey: orpc.documentSearch.key() })
      return
    case 'folder.changed':
      // A folder change rewrites descendant paths + document haystacks, so the
      // document list and search results can shift too. Thumbnails are untouched
      // (same reasoning as document.changed).
      void queryClient.invalidateQueries({ queryKey: orpc.folder.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.document.listDocuments.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.document.documentHistory.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.documentSearch.key() })
      return
    case 'bin.changed':
      // Soft-delete / restore / hard-delete move an item in or out of the
      // (admin) bin. Published only by those mutations, so unrelated document
      // and folder edits leave the bin query untouched.
      void queryClient.invalidateQueries({ queryKey: orpc.bin.key() })
      return
    case 'recommendation.changed':
      void queryClient.invalidateQueries({ queryKey: orpc.recommendation.key() })
      return
    case 'booking.changed':
      void queryClient.invalidateQueries({ queryKey: orpc.booking.key() })
      return
  }
}

// Every event kind, so a post-gap resync can replay exactly the invalidations
// the live stream would have performed — including the deliberate omissions
// above (thumbnails stay cached). `satisfies` makes adding a variant to
// `realtimeEventSchema` a build error until it is listed here too.
const ALL_EVENT_KINDS = Object.keys({
  'user.changed': true,
  'presence.changed': true,
  'share.changed': true,
  'document.changed': true,
  'folder.changed': true,
  'bin.changed': true,
  'recommendation.changed': true,
  'booking.changed': true,
} satisfies Record<RealtimeEventKind, true>) as RealtimeEventKind[]

// One SSE subscription per authenticated tab, held open only while the tab is
// actually in use (`useActivityGate`). Mounted from `_authenticated.tsx` so it
// covers the whole session and every authenticated route without re-subscribing.
//
// Gating matters for cost, not just tidiness: an always-open stream is an
// in-flight request, and Vercel bills Fluid Provisioned Memory for an
// instance's entire lifetime — "until the last in-flight request completes".
// See the 2026-08-06 amendment to ADR-0011.
export function useRealtimeSync(): void {
  const queryClient = useQueryClient()
  const shouldStream = useActivityGate()
  // Set whenever the gate closes the stream, so the next successful open knows
  // it has a gap to make up. TanStack Query's `refetchOnWindowFocus` listens
  // only to `visibilitychange`, so it covers a hidden-tab gap but *not* an
  // idle-while-visible one — without this, a tab that reconnects after going
  // idle would render pre-gap data behind a live-looking connection.
  const missedEvents = useRef(false)

  useEffect(() => {
    if (!shouldStream) {
      missedEvents.current = true
      return
    }

    const controller = new AbortController()
    const log = logger.child({ scope: 'realtime' })

    void backOff(
      async () => {
        const stream = await client.realtime.events(undefined, { signal: controller.signal })
        log.info('realtime subscription opened')
        if (missedEvents.current) {
          missedEvents.current = false
          for (const kind of ALL_EVENT_KINDS) {
            dispatch(queryClient, kind)
          }
          log.debug('resynced after realtime gap')
        }
        for await (const event of stream) {
          dispatch(queryClient, event.kind)
        }
        throw new Error('realtime stream ended')
      },
      {
        startingDelay: 1000,
        timeMultiple: 2,
        maxDelay: 30_000,
        numOfAttempts: Number.POSITIVE_INFINITY,
        jitter: 'full',
        retry: (err, attempt) => {
          if (controller.signal.aborted) return false
          if (isDefinedError(err) && err.code === 'UNAUTHORIZED') {
            log.error('realtime subscription unauthorized', { error: err })
            return false
          }
          log.warn('realtime connection lost', { attempt, error: err })
          return true
        },
      },
    ).catch(() => {
      // backOff only rejects after retry returned false; the reason is already logged
    })

    return () => {
      controller.abort()
      log.debug('realtime subscription closed')
    }
  }, [queryClient, shouldStream])
}
