import {
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { parseFolderDropId } from '~/components/document/documentHelpers'
import type { RouterOutputs } from '~/lib/orpc/client'
import { orpc } from '~/lib/orpc/client'
import { optimisticRemove } from '~/lib/orpc/optimistic'

/** A row as returned by `document.listDocuments` — derived so it can't drift. */
type DocumentRow = RouterOutputs['document']['listDocuments'][number]

// Default snap-back animates the ghost home to the source row, which reads as
// a bounce-back even on success. On a real move we instead shrink-and-fade the
// ghost into the dropped folder's center; empty-space drops keep the snap-back.
const transformToCss = (t: { x: number; y: number; scaleX: number; scaleY: number }) =>
  `translate3d(${t.x}px, ${t.y}px, 0) scaleX(${t.scaleX}) scaleY(${t.scaleY})`

/**
 * Owns the drag-and-drop behaviour of the documents library: the optimistic
 * move mutation, dnd-kit sensors, pointer/keyboard collision detection, the
 * drag handlers, and the fly-into-folder drop animation. `DocumentsView`
 * supplies the URL-resolved folder and the documents in view, and spreads the
 * returned props onto its `<DndContext>` / `<DragOverlay>`.
 */
export function useDocumentDnd({
  activeFolderId,
  visibleDocuments,
}: {
  /** Resolved folder id from the URL, or null for the virtual root. */
  activeFolderId: string | null
  visibleDocuments: ReadonlyArray<DocumentRow>
}) {
  const queryClient = useQueryClient()

  const [activeId, setActiveId] = useState<string | null>(null)
  const activeDoc = activeId ? visibleDocuments.find((d) => d.id === activeId) : undefined
  // Set on a successful drop so the drop animation flies the ghost into the
  // target folder instead of snapping back to the source row. Null = no move.
  const dropTargetRect = useRef<ClientRect | null>(null)

  const moveMutation = useMutation(
    orpc.document.moveDocument.mutationOptions({
      onMutate: async ({ id }) => {
        // A drop always targets a *different* folder (a child chip or an ancestor
        // crumb), so the moved doc leaves the current view. Drop it from this
        // folder's scoped cache immediately, before the server round-trip.
        await optimisticRemove(
          queryClient,
          orpc.document.listDocuments.queryKey({ input: { folderId: activeFolderId } }),
          (doc) => doc.id === id,
        )
      },
      onSuccess: () => toast.success('Dokumentet flyttades'),
      onError: (err) => toast.error(err.message || 'Kunde inte flytta dokumentet'),
      // Reconcile on both outcomes: confirms the move on success, and re-syncs
      // from the server on error (rolling back the optimistic patch).
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.document.key() }),
    }),
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  // For a pointer drag the cursor is the source of truth: `pointerWithin`
  // highlights only the folder actually under the cursor and returns nothing
  // otherwise (so dropping in empty space is a clean no-op). A rect-based
  // fallback is wrong here — the drag overlay inherits the full row width, so
  // `rectIntersection` would always pick the rightmost folder. Only the
  // keyboard sensor, which has no pointer, needs that rect-based fallback.
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => (args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)),
    [],
  )

  const onDragStart = useCallback((event: DragStartEvent) => {
    dropTargetRect.current = null
    setActiveId((event.active.data.current?.documentId as string | undefined) ?? null)
  }, [])

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      dropTargetRect.current = null
      const documentId = event.active.data.current?.documentId as string | undefined
      const over = event.over
      if (documentId && over) {
        const target = parseFolderDropId(String(over.id))
        const doc = visibleDocuments.find((d) => d.id === documentId)
        if (target !== undefined && doc && doc.folderId !== target) {
          // Real move: fly the ghost into the dropped target rather than snap back.
          dropTargetRect.current = over.rect
          moveMutation.mutate({ id: documentId, folderId: target })
        }
      }
      setActiveId(null)
    },
    [visibleDocuments, moveMutation],
  )

  const onDragCancel = useCallback(() => setActiveId(null), [])

  const dropAnimation = useMemo<DropAnimation>(
    () => ({
      duration: 220,
      easing: 'ease-out',
      sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0' } } }),
      keyframes: ({ transform, dragOverlay }) => {
        const target = dropTargetRect.current
        // dnd-kit sizes the overlay wrapper to the full-width source row, so the
        // visible card sits at the wrapper's left edge. Anchor the fly-in on the
        // card itself (translate its centre onto the folder, scale toward it).
        const card = dragOverlay.node?.querySelector<HTMLElement>('[data-drag-card]')
        if (!target || !card) {
          return [
            { transform: transformToCss(transform.initial) },
            { transform: transformToCss(transform.final) },
          ]
        }
        const wrapper = dragOverlay.node.getBoundingClientRect()
        const cardBox = card.getBoundingClientRect()
        const cardCx = cardBox.left + cardBox.width / 2
        const cardCy = cardBox.top + cardBox.height / 2
        const finalX = transform.initial.x + (target.left + target.width / 2 - cardCx)
        const finalY = transform.initial.y + (target.top + target.height / 2 - cardCy)
        // transform-origin (wrapper-local) at the card centre so the shrink
        // collapses onto the folder, not onto the wide wrapper's centre.
        const origin = `${cardCx - wrapper.left}px ${cardCy - wrapper.top}px`
        return [
          { transformOrigin: origin, opacity: 1, transform: transformToCss(transform.initial) },
          {
            transformOrigin: origin,
            opacity: 0,
            transform: `translate3d(${finalX}px, ${finalY}px, 0) scale(0.12)`,
          },
        ]
      },
    }),
    [],
  )

  return {
    /** Spread onto `<DndContext>`. */
    dndContextProps: { sensors, collisionDetection, onDragStart, onDragEnd, onDragCancel },
    /** The document under the active drag, for the `<DragOverlay>` ghost (undefined when idle). */
    activeDoc,
    /** Fly-into-folder drop animation config for `<DragOverlay>`. */
    dropAnimation,
  }
}
