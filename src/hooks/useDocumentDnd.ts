import {
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { type FolderRow, parseFolderDropId } from '~/components/document/documentHelpers'
import { client, orpc, type RouterOutputs } from '~/lib/orpc/client'
import { optimisticPatch, optimisticRemove } from '~/lib/orpc/optimistic'

/** A row as returned by `document.listDocuments` — derived so it can't drift. */
type DocumentRow = RouterOutputs['document']['listDocuments'][number]

// Default snap-back animates the ghost home to the source row, which reads as
// a bounce-back even on success. On a real move we instead shrink-and-fade the
// ghost into the dropped folder's center; empty-space drops keep the snap-back.
const transformToCss = (t: { x: number; y: number; scaleX: number; scaleY: number }) =>
  `translate3d(${t.x}px, ${t.y}px, 0) scaleX(${t.scaleX}) scaleY(${t.scaleY})`

/**
 * Owns the drag-and-drop behaviour of the documents library: the optimistic
 * (group) move, dnd-kit sensors, pointer/keyboard collision detection, the drag
 * handlers, and the fly-into-folder drop animation. `DocumentsView` supplies the
 * URL-resolved folder, the documents in view, the current selection, and a
 * selection-clear callback, and spreads the returned props onto its
 * `<DndContext>` / `<DragOverlay>`. The whole file row is the drag activator
 * (the per-row `useDraggable` lives in `DocumentTable`); dragging a row that's
 * part of the selection moves the whole selection.
 */
type ActiveDrag = { kind: 'document'; id: string } | { kind: 'folder'; id: string }

export function useDocumentDnd({
  activeFolderId,
  visibleDocuments,
  folders,
  selectedIds,
  clearSelection,
}: {
  /** Resolved folder id from the URL, or null for the virtual root. */
  activeFolderId: string | null
  visibleDocuments: ReadonlyArray<DocumentRow>
  /** The flat folder tree — for the folder drag ghost + descendant guard. */
  folders: ReadonlyArray<FolderRow>
  /** Ids currently selected (a drag that starts on one of these moves them all). */
  selectedIds: ReadonlyArray<string>
  clearSelection: () => void
}) {
  const queryClient = useQueryClient()

  // A drag carries either a document (with multi-select group semantics) or a
  // single folder, discriminated by `event.active.data`.
  const [active, setActive] = useState<ActiveDrag | null>(null)
  const activeDoc =
    active?.kind === 'document' ? visibleDocuments.find((d) => d.id === active.id) : undefined
  const activeFolder =
    active?.kind === 'folder' ? folders.find((f) => f.id === active.id) : undefined
  // How many docs the active drag carries: the whole selection when the dragged
  // row is selected, else just the one (0 for a folder drag).
  const activeCount =
    active?.kind === 'document' ? (selectedIds.includes(active.id) ? selectedIds.length : 1) : 0
  // Set on a successful drop so the drop animation flies the ghost into the
  // target folder instead of snapping back to the source row. Null = no move.
  const dropTargetRect = useRef<ClientRect | null>(null)

  // Mouse drags after a 6px move (so a click selects / a double-click opens
  // without dragging). Touch needs a 200ms press-hold to start — a quick swipe
  // under the tolerance scrolls the list instead. Keyboard keeps drag a11y.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
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

  // No batch endpoint: drop all moved ids from the source list once, fan out
  // single moves in parallel, then reconcile + toast once (looping a mutation
  // with its own callbacks would toast and invalidate N times).
  const runMove = useCallback(
    async (ids: Array<string>, folderId: string | null) => {
      const idSet = new Set(ids)
      await optimisticRemove(
        queryClient,
        orpc.document.listDocuments.queryKey({ input: { folderId: activeFolderId } }),
        (doc) => idSet.has(doc.id),
      )
      const results = await Promise.allSettled(
        ids.map((id) => client.document.moveDocument({ id, folderId })),
      )
      await queryClient.invalidateQueries({ queryKey: orpc.document.listDocuments.key() })
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed === 0) {
        toast.success(
          ids.length === 1 ? 'Dokumentet flyttades' : `${ids.length} dokument flyttades`,
        )
        clearSelection()
      } else {
        toast.error(`${failed} av ${ids.length} kunde inte flyttas`)
      }
    },
    [queryClient, activeFolderId, clearSelection],
  )

  // Folder move reuses the existing admin-only `folder.moveFolder` (which
  // cascades descendant paths + rebuilds document haystacks server-side).
  // Optimistically re-parent the folder so it leaves the current view's child
  // list immediately; the `finally` invalidate reconciles the authoritative
  // tree (paths, descendants) and reverts on error — so no need to recompute
  // paths here.
  const runFolderMove = useCallback(
    async (id: string, newParentId: string | null) => {
      await optimisticPatch(
        queryClient,
        orpc.folder.tree.queryKey(),
        (f) => f.id === id,
        (f) => ({ ...f, parentId: newParentId }),
      )

      try {
        await client.folder.moveFolder({ id, newParentId })
        toast.success('Mappen flyttades')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Kunde inte flytta mappen')
      } finally {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.folder.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.document.listDocuments.key() }),
        ])
      }
    },
    [queryClient],
  )

  const onDragStart = useCallback((event: DragStartEvent) => {
    dropTargetRect.current = null
    const data = event.active.data.current
    if (data?.documentId) setActive({ kind: 'document', id: data.documentId as string })
    else if (data?.folderId) setActive({ kind: 'folder', id: data.folderId as string })
    else setActive(null)
  }, [])

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      dropTargetRect.current = null
      const data = event.active.data.current
      const over = event.over
      if (over) {
        const target = parseFolderDropId(String(over.id))
        if (target !== undefined && data?.documentId) {
          const draggedId = data.documentId as string
          // A selected row drags the whole selection; an unselected row drags itself.
          const dragSet = selectedIds.includes(draggedId) ? selectedIds : [draggedId]
          const ids = dragSet.filter((id) => {
            const doc = visibleDocuments.find((d) => d.id === id)
            return doc && doc.folderId !== target
          })
          if (ids.length > 0) {
            // Real move: fly the ghost into the dropped target rather than snap back.
            dropTargetRect.current = over.rect
            void runMove(ids, target)
          }
        } else if (target !== undefined && data?.folderId) {
          const draggedId = data.folderId as string
          const dragged = folders.find((f) => f.id === draggedId)
          const targetFolder = target === null ? null : folders.find((f) => f.id === target)
          // Skip no-ops/illegals; the service also rejects subtree moves.
          const isSelf = target === draggedId
          const sameParent = (dragged?.parentId ?? null) === target
          const intoSubtree =
            !!dragged && !!targetFolder && targetFolder.path.startsWith(dragged.path)
          if (!isSelf && !sameParent && !intoSubtree) {
            dropTargetRect.current = over.rect
            void runFolderMove(draggedId, target)
          }
        }
      }
      setActive(null)
    },
    [selectedIds, visibleDocuments, folders, runMove, runFolderMove],
  )

  const onDragCancel = useCallback(() => setActive(null), [])

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
    /** The folder under the active drag, for the `<DragOverlay>` ghost (undefined when idle). */
    activeFolder,
    /** How many documents the active drag carries (for the overlay count badge). */
    activeCount,
    /** Fly-into-folder drop animation config for `<DragOverlay>`. */
    dropAnimation,
  }
}
