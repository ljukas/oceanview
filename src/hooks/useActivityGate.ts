import { useEffect, useState } from 'react'
import { logger } from '~/lib/logger/browser'
import {
  ACTIVITY_GATE_CONFIG,
  type ActivityGateConfig,
  type ActivityGateEvent,
  createActivityGateState,
  nextActivityGateDelay,
  reduceActivityGate,
} from '~/utils/activityGate'

// `visibilitychange` is the primary signal; the rest answer "is a human still
// here" for a tab that stays visible. Capture phase because `scroll` doesn't
// bubble out of nested containers (the document table, the sidebar), and
// passive so we never delay the browser's own scroll/touch handling.
const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
] as const
const ACTIVITY_LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true }

/**
 * True while this tab should hold its realtime SSE stream open: visible (or
 * hidden for less than the grace period) and not idle. Framework binding only —
 * the decision logic is the pure reducer in `~/utils/activityGate`.
 *
 * Config is destructured so the effect depends on two primitives; passing an
 * inline object is safe and won't re-arm the listeners every render.
 */
export function useActivityGate({
  gracePeriodMs,
  idleTimeoutMs,
}: ActivityGateConfig = ACTIVITY_GATE_CONFIG): boolean {
  // Must start `true` to match `createActivityGateState` below: the reducer is
  // the single source of truth and this only mirrors its flips. Seeding it from
  // `document.visibilityState` instead looks like an easy win for tabs opened in
  // the background, but it desyncs the two — the reducer would still say
  // `shouldStream: true`, so neither the `hidden` nor the later `visible` event
  // flips anything, no `setShouldStream` ever fires, and the tab never connects
  // for the rest of its life. A background-opened tab instead streams for one
  // grace period and then stops, which is the same deal every hidden tab gets.
  //
  // Safe during SSR: `document` is only touched inside the effect, and nothing
  // renders from this value, so there's no hydration mismatch either.
  const [shouldStream, setShouldStream] = useState(true)

  useEffect(() => {
    const config = { gracePeriodMs, idleTimeoutMs }
    const log = logger.child({ scope: 'activityGate' })
    // Effect-local rather than a ref: every reader and writer is defined in
    // here, and the whole machine is torn down and rebuilt together.
    let state = createActivityGateState(performance.now())
    let timer: ReturnType<typeof setTimeout> | undefined

    function scheduleTick() {
      clearTimeout(timer)
      const delay = nextActivityGateDelay(state, config, performance.now())
      if (delay === null) return
      timer = setTimeout(() => apply({ type: 'tick', at: performance.now() }), delay)
    }

    function apply(event: ActivityGateEvent) {
      const previous = state
      state = reduceActivityGate(previous, event, config)
      const flipped = state.shouldStream !== previous.shouldStream
      if (flipped) {
        setShouldStream(state.shouldStream)
        log.debug('activity gate flipped', {
          shouldStream: state.shouldStream,
          visibility: state.visibility,
        })
      }
      // Activity only pushes the idle deadline further out. The pending tick
      // re-derives real elapsed time and reschedules itself, so it self-corrects
      // without touching a timer on every pointer move. Everything else may have
      // created or cleared a deadline, so re-arm.
      if (flipped || event.type !== 'activity') scheduleTick()
    }

    function onVisibilityChange() {
      apply({
        type: document.visibilityState === 'visible' ? 'visible' : 'hidden',
        at: performance.now(),
      })
    }

    function onActivity() {
      apply({ type: 'activity', at: performance.now() })
    }

    // Sync to the tab's real visibility before listening: a tab opened in the
    // background (cmd-click) never fires a transition to observe, and this also
    // arms the first idle deadline.
    onVisibilityChange()

    document.addEventListener('visibilitychange', onVisibilityChange)
    for (const type of ACTIVITY_EVENTS) {
      document.addEventListener(type, onActivity, ACTIVITY_LISTENER_OPTIONS)
    }

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      for (const type of ACTIVITY_EVENTS) {
        document.removeEventListener(type, onActivity, ACTIVITY_LISTENER_OPTIONS)
      }
    }
  }, [gracePeriodMs, idleTimeoutMs])

  return shouldStream
}
