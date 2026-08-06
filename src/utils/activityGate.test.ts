import { describe, expect, it } from 'vitest'
import {
  type ActivityGateState,
  createActivityGateState,
  nextActivityGateDelay,
  reduceActivityGate,
} from './activityGate'

// Small round numbers so the arithmetic in each case is obvious at a glance.
// The reducer only ever subtracts two timestamps from the same source, so the
// values are arbitrary — `performance.now()` in production, integers here.
const CONFIG = { gracePeriodMs: 1_000, idleTimeoutMs: 10_000 }

const T0 = 5_000

function reduceAll(
  state: ActivityGateState,
  events: Parameters<typeof reduceActivityGate>[1][],
): ActivityGateState {
  return events.reduce((acc, event) => reduceActivityGate(acc, event, CONFIG), state)
}

describe('reduceActivityGate', () => {
  it('starts visible and streaming', () => {
    const state = createActivityGateState(T0)
    expect(state).toEqual({
      visibility: 'visible',
      shouldStream: true,
      hiddenAt: null,
      lastActiveAt: T0,
    })
  })

  it('keeps streaming while hidden inside the grace period', () => {
    const state = reduceAll(createActivityGateState(T0), [
      { type: 'hidden', at: T0 },
      { type: 'tick', at: T0 + CONFIG.gracePeriodMs - 1 },
    ])
    expect(state.shouldStream).toBe(true)
  })

  it('stops streaming once the grace period has elapsed', () => {
    const state = reduceAll(createActivityGateState(T0), [
      { type: 'hidden', at: T0 },
      // Boundary: exactly at the limit must already close (the reducer uses >=).
      { type: 'tick', at: T0 + CONFIG.gracePeriodMs },
    ])
    expect(state.shouldStream).toBe(false)
  })

  it('cancels a pending disconnect when the tab returns before the grace period', () => {
    const state = reduceAll(createActivityGateState(T0), [
      { type: 'hidden', at: T0 },
      { type: 'visible', at: T0 + 500 },
      // A tick that would have closed the stream had the tab stayed hidden.
      { type: 'tick', at: T0 + CONFIG.gracePeriodMs },
    ])
    expect(state.shouldStream).toBe(true)
    expect(state.hiddenAt).toBeNull()
  })

  it('reconnects when a tab that timed out while hidden becomes visible', () => {
    const state = reduceAll(createActivityGateState(T0), [
      { type: 'hidden', at: T0 },
      { type: 'tick', at: T0 + CONFIG.gracePeriodMs },
      { type: 'visible', at: T0 + 60_000 },
    ])
    expect(state.shouldStream).toBe(true)
    expect(state.lastActiveAt).toBe(T0 + 60_000)
  })

  it('keeps streaming while a visible tab is being used', () => {
    const state = reduceAll(createActivityGateState(T0), [
      { type: 'activity', at: T0 + 9_000 },
      { type: 'tick', at: T0 + 9_000 + CONFIG.idleTimeoutMs - 1 },
    ])
    expect(state.shouldStream).toBe(true)
  })

  it('stops streaming when a visible tab goes idle', () => {
    const state = reduceAll(createActivityGateState(T0), [
      { type: 'tick', at: T0 + CONFIG.idleTimeoutMs },
    ])
    expect(state.shouldStream).toBe(false)
  })

  it('reconnects on activity after an idle disconnect', () => {
    const state = reduceAll(createActivityGateState(T0), [
      { type: 'tick', at: T0 + CONFIG.idleTimeoutMs },
      { type: 'activity', at: T0 + CONFIG.idleTimeoutMs + 1 },
    ])
    expect(state.shouldStream).toBe(true)
    expect(state.lastActiveAt).toBe(T0 + CONFIG.idleTimeoutMs + 1)
  })

  it('ignores activity while hidden so it cannot revive a tab mid-grace-period', () => {
    const hidden = reduceAll(createActivityGateState(T0), [{ type: 'hidden', at: T0 }])
    const afterActivity = reduceActivityGate(hidden, { type: 'activity', at: T0 + 1 }, CONFIG)
    expect(afterActivity).toBe(hidden)
    // The grace clock is untouched, so the original deadline still applies.
    expect(
      reduceActivityGate(afterActivity, { type: 'tick', at: T0 + CONFIG.gracePeriodMs }, CONFIG)
        .shouldStream,
    ).toBe(false)
  })

  it('stays disconnected when an already-idle tab is then hidden', () => {
    const state = reduceAll(createActivityGateState(T0), [
      { type: 'tick', at: T0 + CONFIG.idleTimeoutMs },
      { type: 'hidden', at: T0 + CONFIG.idleTimeoutMs + 1 },
    ])
    expect(state.shouldStream).toBe(false)
    expect(state.hiddenAt).toBe(T0 + CONFIG.idleTimeoutMs + 1)
  })

  it('refreshes the idle clock when a tab becomes visible again', () => {
    // Without this, returning to a long-backgrounded tab would immediately
    // trip the idle timeout on the next tick.
    const state = reduceAll(createActivityGateState(T0), [
      { type: 'hidden', at: T0 },
      { type: 'tick', at: T0 + CONFIG.gracePeriodMs },
      { type: 'visible', at: T0 + 100_000 },
      { type: 'tick', at: T0 + 100_000 + CONFIG.idleTimeoutMs - 1 },
    ])
    expect(state.shouldStream).toBe(true)
  })

  it('returns the same state object when nothing changes', () => {
    const state = createActivityGateState(T0)
    // Referential stability keeps the React binding from re-rendering on ticks
    // and repeated visibility events that decide nothing.
    expect(reduceActivityGate(state, { type: 'tick', at: T0 + 1 }, CONFIG)).toBe(state)
    const hidden = reduceActivityGate(state, { type: 'hidden', at: T0 }, CONFIG)
    expect(reduceActivityGate(hidden, { type: 'hidden', at: T0 + 1 }, CONFIG)).toBe(hidden)
  })
})

describe('nextActivityGateDelay', () => {
  it('schedules nothing once the stream is closed', () => {
    const closed = reduceAll(createActivityGateState(T0), [
      { type: 'tick', at: T0 + CONFIG.idleTimeoutMs },
    ])
    expect(nextActivityGateDelay(closed, CONFIG, T0 + CONFIG.idleTimeoutMs)).toBeNull()
  })

  it('counts down the grace period while hidden', () => {
    const hidden = reduceAll(createActivityGateState(T0), [{ type: 'hidden', at: T0 }])
    expect(nextActivityGateDelay(hidden, CONFIG, T0 + 400)).toBe(CONFIG.gracePeriodMs - 400)
  })

  it('counts down the idle timeout while visible', () => {
    const state = createActivityGateState(T0)
    expect(nextActivityGateDelay(state, CONFIG, T0 + 2_000)).toBe(CONFIG.idleTimeoutMs - 2_000)
  })

  it('clamps to zero when the deadline already passed', () => {
    // Models a timer that fired late — a throttled background tab, or a laptop
    // resumed from sleep. The caller must re-tick immediately, never wait on a
    // negative delay.
    const hidden = reduceAll(createActivityGateState(T0), [{ type: 'hidden', at: T0 }])
    expect(nextActivityGateDelay(hidden, CONFIG, T0 + 60_000)).toBe(0)
  })
})
