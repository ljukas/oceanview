// Decides whether a tab should be holding its realtime SSE stream open, from
// visibility plus user activity. Pure: no DOM, no timers, no clock reads —
// every timestamp arrives on the event, so the whole state machine is testable
// with plain numbers in the fast `node` project instead of needing Chromium and
// fake timers. `useActivityGate` (`~/hooks/useActivityGate`) owns the I/O half.
//
// Why this exists: an always-open SSE stream keeps a Vercel Fluid instance
// provisioned around the clock, and Provisioned Memory bills for the entire
// instance lifetime (~1,460 GB-hrs/month against a 360 GB-hr Hobby allowance).
// That overage soft-blocked the account (`FAIR_USE_LIMITS_EXCEEDED`,
// `blockedDueToOverageType: 'fluidDuration'`). Gating the stream on real usage
// is the fix. See the 2026-08-06 amendment to ADR-0011.

export type ActivityGateConfig = {
  /** How long a hidden tab keeps streaming before it disconnects. */
  gracePeriodMs: number
  /** How long a *visible* tab may sit without input before it disconnects. */
  idleTimeoutMs: number
}

// The grace period absorbs ordinary alt-tabbing so a quick switch away never
// tears the stream down — which matters beyond UX, because every disconnect
// that drops a user's last connection publishes `presence.changed` to every
// other tab. The idle timeout covers the case visibility alone misses: a tab
// parked visible on a second monitor, which would otherwise bill 24/7.
export const ACTIVITY_GATE_CONFIG: ActivityGateConfig = {
  gracePeriodMs: 60_000,
  idleTimeoutMs: 30 * 60_000,
}

export type ActivityGateState = {
  readonly visibility: 'visible' | 'hidden'
  /** Whether the stream should currently be open. */
  readonly shouldStream: boolean
  /** When the tab last became hidden; null while visible. */
  readonly hiddenAt: number | null
  /** Last activity signal, or the moment the tab last became visible. */
  readonly lastActiveAt: number
}

export type ActivityGateEvent =
  | { type: 'visible'; at: number }
  | { type: 'hidden'; at: number }
  | { type: 'activity'; at: number }
  | { type: 'tick'; at: number }

export function createActivityGateState(at: number): ActivityGateState {
  return { visibility: 'visible', shouldStream: true, hiddenAt: null, lastActiveAt: at }
}

export function reduceActivityGate(
  state: ActivityGateState,
  event: ActivityGateEvent,
  config: ActivityGateConfig,
): ActivityGateState {
  switch (event.type) {
    case 'visible':
      // Becoming visible always reconnects, whichever timeout closed the
      // stream. It also counts as activity, so returning to a tab doesn't
      // leave a stale `lastActiveAt` that re-arms an immediate idle close.
      if (state.visibility === 'visible' && state.shouldStream) {
        return { ...state, lastActiveAt: event.at }
      }
      return { visibility: 'visible', shouldStream: true, hiddenAt: null, lastActiveAt: event.at }
    case 'hidden':
      // Going hidden only starts the clock; the `tick` does the disconnecting.
      if (state.visibility === 'hidden') return state
      return { ...state, visibility: 'hidden', hiddenAt: event.at }
    case 'activity':
      // Pointer/keyboard events can't fire on a hidden document; ignore them
      // defensively rather than letting one revive a tab mid-grace-period.
      if (state.visibility !== 'visible') return state
      return { ...state, shouldStream: true, lastActiveAt: event.at }
    case 'tick': {
      if (!state.shouldStream) return state
      const elapsed =
        state.visibility === 'hidden'
          ? // `hiddenAt` is always set while hidden, but fall back to "not yet
            // elapsed" rather than trusting a non-null assertion.
            state.hiddenAt === null
            ? Number.NEGATIVE_INFINITY
            : event.at - state.hiddenAt
          : event.at - state.lastActiveAt
      const limit = state.visibility === 'hidden' ? config.gracePeriodMs : config.idleTimeoutMs
      return elapsed >= limit ? { ...state, shouldStream: false } : state
    }
  }
}

/**
 * Milliseconds until this state next needs a `tick`, or null when nothing is
 * pending. Always derived from the caller's `now` rather than a remembered
 * duration, so a timer that fires late — background-tab throttling, a resumed
 * laptop, a bfcache freeze — simply re-evaluates real elapsed time instead of
 * disconnecting on a stale schedule. Never negative.
 */
export function nextActivityGateDelay(
  state: ActivityGateState,
  config: ActivityGateConfig,
  now: number,
): number | null {
  if (!state.shouldStream) return null
  if (state.visibility === 'hidden') {
    if (state.hiddenAt === null) return null
    return Math.max(0, config.gracePeriodMs - (now - state.hiddenAt))
  }
  return Math.max(0, config.idleTimeoutMs - (now - state.lastActiveAt))
}
