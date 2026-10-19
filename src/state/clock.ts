/**
 * The one clock the UI reads. Every `now` handed to the engine (store
 * actions, ticks, hydration) and every live display (`useNow`) comes from
 * `now()`, so a debug offset moves the whole app in time consistently.
 * The engine itself stays pure: it only ever receives the number.
 */

let offsetMs = 0;

/** Current time in Unix ms, shifted by the debug offset (0 outside tests). */
export function now(): number {
  return Date.now() + offsetMs;
}

/** Shift `now()` by `ms` (negative allowed, non-finite ignored). */
export function setNowOffsetMs(ms: number): void {
  offsetMs = Number.isFinite(ms) ? Math.trunc(ms) : 0;
}

export function getNowOffsetMs(): number {
  return offsetMs;
}
